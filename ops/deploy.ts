#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { $ } from "bun";
import {
  buildAPI,
  buildContainer,
  pushContainer,
  tagContainer,
} from "./tools/docker";
import { loadEnvironment } from "./tools/environment";
import { buildClient, deployFunctions, deployHosting } from "./tools/firebase";
import { log, logError, logStep, logSuccess, logWarning } from "./tools/log";
import { applyInfrastructure, getAPIURL } from "./tools/tofu";
import { determineContainerTags, getPrimaryTag } from "./tools/versioning";

interface DeployArgs {
  component: "api" | "client" | "functions" | "firestore" | "full";
  env: "dev" | "prod";
  version?: string;
  channel?: string;
  dryRun: boolean;
  skipBuild: boolean;
}

function parseArguments(): DeployArgs {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      env: { type: "string", short: "e" },
      version: { type: "string", short: "v" },
      channel: { type: "string", short: "c" },
      "dry-run": { type: "boolean", default: false },
      "skip-build": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const component = positionals[0] as DeployArgs["component"];
  if (
    !(
      component &&
      ["api", "client", "functions", "firestore", "full"].includes(component)
    )
  ) {
    throw new Error(
      "Component required: api, client, functions, firestore, or full",
    );
  }

  const env = (values.env as "dev" | "prod") || "dev";
  if (!["dev", "prod"].includes(env)) {
    throw new Error('Environment must be "dev" or "prod"');
  }

  return {
    component,
    env,
    version: values.version as string | undefined,
    channel: values.channel as string | undefined,
    dryRun: values["dry-run"] as boolean,
    skipBuild: values["skip-build"] as boolean,
  };
}

async function deployAPI(
  args: DeployArgs,
  projectId: string,
  firebaseProjectId: string,
): Promise<void> {
  const envConfig = loadEnvironment(args.env);
  const tags = await determineContainerTags(args.env, args.version);
  const primaryTag = getPrimaryTag(tags);

  logStep("Deploy API", `Environment: ${args.env}, Tags: ${tags.join(", ")}`);

  if (args.dryRun) {
    logWarning("Dry run mode - no changes will be made");
    log("Would build API binary");
    log("Would build Docker container");
    log(`Would tag container: ${tags.join(", ")}`);
    log(`Would push container to ${envConfig.containerRepo}`);
    log(`Would apply OpenTofu with tag ${primaryTag}`);
    return;
  }

  if (!args.skipBuild) {
    await buildAPI();
  } else {
    logStep("API", "Skipping build (using existing build artifact)");
  }
  await buildContainer();
  await tagContainer(projectId, envConfig.containerRepo, tags);
  await pushContainer(projectId, envConfig.containerRepo, tags);
  await applyInfrastructure(
    envConfig,
    primaryTag,
    projectId,
    firebaseProjectId,
  );

  const apiURL = await getAPIURL();
  logSuccess("API deployed successfully!");
  log(`API URL: ${apiURL}`);
  log(`Container tags: ${tags.join(", ")}`);
}

async function deployClient(args: DeployArgs): Promise<void> {
  const envConfig = loadEnvironment(args.env);

  logStep(
    "Deploy Client",
    `Environment: ${args.env}, Site: ${envConfig.hostingSite}`,
  );

  if (args.dryRun) {
    logWarning("Dry run mode - no changes will be made");
    log("Would build client");
    if (args.channel) {
      log(`Would deploy to preview channel: ${args.channel}`);
    } else {
      log(`Would deploy to live site: ${envConfig.hostingSite}`);
    }
    return;
  }

  if (!args.skipBuild) {
    await buildClient();
  } else {
    logStep("Client", "Skipping build (using existing build artifact)");
  }
  const result = await deployHosting(envConfig, args.channel);

  logSuccess("Client deployed successfully!");
  if (args.channel) {
    log(`Preview channel: ${args.channel}`);
  } else {
    log(`Live site: ${envConfig.hostingSite}`);
  }
  log(`\n${result}`);
}

async function deployFunctionsComponent(
  args: DeployArgs,
  firebaseProjectId: string,
): Promise<void> {
  logStep("Deploy Functions", `Project: ${firebaseProjectId}`);

  if (args.dryRun) {
    logWarning("Dry run mode - no changes will be made");
  }

  if (!args.skipBuild) {
    logStep("Build", "Building TypeScript...");
    const { resolve } = await import("node:path");
    const projectRoot = resolve(import.meta.dir, "..");
    await $`cd ${projectRoot} && bun run build`;
  } else {
    logStep("Functions", "Skipping build (using existing build artifact)");
  }

  logStep("Functions", "Copying dependencies...");
  const { resolve } = await import("node:path");
  const { cpSync, mkdirSync, writeFileSync } = await import("node:fs");
  const projectRoot = resolve(import.meta.dir, "..");

  // Copy core dist so relative imports work
  cpSync(
    resolve(projectRoot, "server/core/dist"),
    resolve(projectRoot, "server/functions/core/dist"),
    { recursive: true },
  );

  // Copy common to node_modules/@common so package imports from core work
  const commonModuleDir = resolve(
    projectRoot,
    "server/functions/node_modules/@common",
  );
  mkdirSync(commonModuleDir, { recursive: true });

  cpSync(
    resolve(projectRoot, "common/dist/types"),
    resolve(commonModuleDir, "types"),
    { recursive: true },
  );

  cpSync(
    resolve(projectRoot, "common/dist/utilities"),
    resolve(commonModuleDir, "utilities"),
    { recursive: true },
  );

  // Create package.json for @common module
  writeFileSync(
    resolve(commonModuleDir, "package.json"),
    JSON.stringify({ name: "@common", type: "module" }, null, 2),
  );

  await deployFunctions(firebaseProjectId, args.dryRun);

  if (args.dryRun) {
    logSuccess("Functions validation completed successfully!");
  } else {
    logSuccess("Functions deployed successfully!");
  }
}

async function deployFullStack(
  args: DeployArgs,
  projectId: string,
  firebaseProjectId: string,
): Promise<void> {
  logStep(
    "Deploy Full Stack",
    `Environment: ${args.env}, Version: ${args.version || "latest"}`,
  );

  if (args.dryRun) {
    logWarning("Dry run mode - no changes will be made");
    return;
  }

  await deployAPI(args, projectId, firebaseProjectId);
  await deployFunctionsComponent(args, firebaseProjectId);
  await deployClient(args);

  logSuccess(`Full stack deployed successfully for ${args.env}!`);
}

async function main(): Promise<void> {
  try {
    const args = parseArguments();

    const projectId = process.env.GCP_PROJECT_ID || process.env.PROJECT_ID;
    const firebaseProjectId =
      process.env.FIREBASE_PROJECT_ID || "auto-gm-372620";

    logStep(
      "Configuration",
      `Component: ${args.component}, Environment: ${args.env}`,
    );

    switch (args.component) {
      case "api":
        if (!projectId) {
          throw new Error(
            "GCP_PROJECT_ID or PROJECT_ID environment variable required for API deployment",
          );
        }
        await deployAPI(args, projectId, firebaseProjectId);
        break;
      case "client":
        await deployClient(args);
        break;
      case "functions":
        await deployFunctionsComponent(args, firebaseProjectId);
        break;
      case "firestore":
        await deployClient(args);
        break;
      case "full":
        if (!projectId) {
          throw new Error(
            "GCP_PROJECT_ID or PROJECT_ID environment variable required for full deployment",
          );
        }
        await deployFullStack(args, projectId, firebaseProjectId);
        break;
      default:
        throw new Error(`Unknown component: ${args.component}`);
    }

    process.exit(0);
  } catch (error) {
    logError(error instanceof Error ? error.message : "Unknown error occurred");
    process.exit(1);
  }
}

main().catch(console.error);
