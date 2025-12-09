#!/usr/bin/env bun
import { $ } from "bun";
import { parseArgs } from "node:util";

import { buildAPI, buildContainer, pushContainer, tagContainer } from "./tools/docker";
import { loadEnvironment } from "./tools/environment";
import { buildClient, deployFirestore, deployFunctions, deployHosting } from "./tools/firebase";
import { log, logError, logStep, logSuccess, logWarning } from "./tools/log";
import { deployMutationAPI } from "./tools/mutation-api";
import {
  applyInfrastructure,
  deployInfrastructure,
  getAPIURL,
  planInfrastructure,
} from "./tools/tofu";
import { determineContainerTags, getPrimaryTag } from "./tools/versioning";

interface DeployArgs {
  readonly component:
    | "api"
    | "client"
    | "functions"
    | "firestore"
    | "mutation-api"
    | "infrastructure"
    | "full";
  readonly env: "prod";
  readonly version?: string;
  readonly channel?: string;
  readonly prNumber?: string;
  readonly skipBuild: boolean;
  readonly skipInfra: boolean;
  readonly skipDeploy: boolean;
}

function parseArguments(): DeployArgs {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      component: { type: "string", short: "c" },
      env: { type: "string", short: "e" },
      version: { type: "string", short: "v" },
      channel: { type: "string" },
      "pr-number": { type: "string" },
      "skip-build": { type: "boolean", default: false },
      "skip-infra": { type: "boolean", default: false },
      "skip-deploy": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  const component = values.component as DeployArgs["component"];
  if (
    !(
      component &&
      [
        "api",
        "client",
        "functions",
        "firestore",
        "mutation-api",
        "infrastructure",
        "full",
      ].includes(component)
    )
  ) {
    throw new Error(
      "Component required (--component or -c): api, client, functions, firestore, mutation-api, infrastructure, or full",
    );
  }

  const env = values.env as "prod" | undefined;
  if (env !== "prod") {
    throw new Error('Environment required (--env prod). Only "prod" environment is supported.');
  }

  return {
    component,
    env,
    version: values.version as string | undefined,
    channel: values.channel as string | undefined,
    prNumber: values["pr-number"] as string | undefined,
    skipBuild: values["skip-build"] as boolean,
    skipInfra: values["skip-infra"] as boolean,
    skipDeploy: values["skip-deploy"] as boolean,
  };
}

async function deployAPI(
  args: DeployArgs,
  projectId: string,
  firebaseProjectId: string,
): Promise<void> {
  const envConfig = loadEnvironment(args.env);
  const tags = await determineContainerTags({
    env: args.env,
    version: args.version,
    prNumber: args.prNumber,
  });
  const primaryTag = getPrimaryTag(tags);

  logStep("Deploy API", `Environment: ${args.env}, Tags: ${tags.join(", ")}`);

  if (args.prNumber) {
    logWarning(`PR validation mode - building and pushing with tag: ${primaryTag}`);
  }

  // Build phase
  if (!args.skipBuild) {
    await buildAPI();
    await buildContainer();
  } else {
    logStep("API", "Skipping build (using existing build artifact)");
  }

  // Push to registry
  await tagContainer(projectId, envConfig.containerRepo, tags);
  await pushContainer(projectId, envConfig.containerRepo, tags);

  // Deploy phase (skip for PR validation)
  if (args.skipDeploy || args.prNumber) {
    logSuccess("Container image built and pushed successfully!");
    log(`Container tags: ${tags.join(", ")}`);
    log(
      `Deploy with: gcloud run deploy auto-coach-api-${args.env} --image ${envConfig.containerRepo}/auto-coach-api:${primaryTag}`,
    );
    return;
  }

  if (!args.skipInfra) {
    await applyInfrastructure(envConfig, primaryTag, projectId, firebaseProjectId);
    const apiURL = await getAPIURL();
    logSuccess("API deployed successfully!");
    log(`API URL: ${apiURL}`);
    log(`Container tags: ${tags.join(", ")}`);
  } else {
    logStep("API", "Skipping infrastructure apply - container pushed successfully");
    logSuccess("Container image ready for deployment");
    log(`Container tags: ${tags.join(", ")}`);
    log(
      `Deploy to Cloud Run with: gcloud run deploy auto-coach-api-${args.env} --image ${envConfig.containerRepo}/auto-coach-api:${primaryTag}`,
    );
  }
}

async function deployClient(args: DeployArgs): Promise<void> {
  const envConfig = loadEnvironment(args.env);
  const isDryRun = Boolean(args.prNumber);

  logStep("Deploy Client", `Environment: ${args.env}, Site: ${envConfig.hostingSite}`);

  if (isDryRun) {
    logWarning("PR validation mode - validating build and deployment");
  }

  if (!args.skipBuild) {
    await buildClient();
  } else {
    logStep("Client", "Skipping build (using existing build artifact)");
  }
  const result = await deployHosting(envConfig, args.channel, isDryRun);

  if (isDryRun) {
    logSuccess("Client validation completed successfully!");
  } else {
    logSuccess("Client deployed successfully!");
  }
  if (args.channel) {
    log(`Preview channel: ${args.channel}`);
  } else {
    log(`Site: ${envConfig.hostingSite}`);
  }
  log(`\n${result}`);
}

async function deployFunctionsComponent(
  args: DeployArgs,
  firebaseProjectId: string,
): Promise<void> {
  const isDryRun = Boolean(args.prNumber);

  logStep("Deploy Functions", `Project: ${firebaseProjectId}`);

  if (isDryRun) {
    logWarning("PR validation mode - validating build and deployment");
  }

  if (!args.skipBuild) {
    logStep("Build", "Building TypeScript...");
    const { resolve } = await import("node:path");
    const projectRoot = resolve(import.meta.dir, "..");
    // Build common and core first
    await $`cd ${projectRoot} && bun run build`;
    // Build functions (outputs to server/functions/lib)
    await $`cd ${projectRoot}/server/functions && bun run build`;
  } else {
    logStep("Functions", "Skipping build (using existing build artifact)");
  }

  logStep("Functions", "Copying dependencies...");
  const { resolve } = await import("node:path");
  const { cpSync, mkdirSync, writeFileSync, existsSync } = await import("node:fs");
  const projectRoot = resolve(import.meta.dir, "..");

  // The functions build outputs to lib/server/functions/ with imports like:
  // - @core/authBlockingFunctions/... -> needs node_modules/@core/
  // - @common/types/... -> needs node_modules/@common/
  // We need to copy the compiled core and common to node_modules so imports resolve

  // Copy @core to node_modules/@core
  // The functions lib has imports to @core/* which map to server/core/src/*
  // The compiled output is in server/functions/lib/server/core/src/
  const coreModuleDir = resolve(projectRoot, "server/functions/node_modules/@core");
  mkdirSync(coreModuleDir, { recursive: true });

  // The functions build includes core in its output at lib/server/core/src/
  const coreFunctionsOutput = resolve(projectRoot, "server/functions/lib/server/core/src");
  if (existsSync(coreFunctionsOutput)) {
    cpSync(coreFunctionsOutput, coreModuleDir, { recursive: true });
  }

  // Create package.json for @core module
  writeFileSync(
    resolve(coreModuleDir, "package.json"),
    JSON.stringify({ name: "@core", type: "module" }, null, 2),
  );

  // Copy @common to node_modules/@common
  const commonModuleDir = resolve(projectRoot, "server/functions/node_modules/@common");
  mkdirSync(commonModuleDir, { recursive: true });

  // The functions build includes common in its output at lib/common/src/
  const commonFunctionsOutput = resolve(projectRoot, "server/functions/lib/common/src");
  if (existsSync(commonFunctionsOutput)) {
    cpSync(commonFunctionsOutput, commonModuleDir, { recursive: true });
  }

  // Create package.json for @common module
  writeFileSync(
    resolve(commonModuleDir, "package.json"),
    JSON.stringify({ name: "@common", type: "module" }, null, 2),
  );

  await deployFunctions(firebaseProjectId, isDryRun);

  if (isDryRun) {
    logSuccess("Functions validation completed successfully!");
  } else {
    logSuccess("Functions deployed successfully!");
  }
}

async function deployFirestoreComponent(
  args: DeployArgs,
  firebaseProjectId: string,
): Promise<void> {
  const isDryRun = Boolean(args.prNumber);

  logStep("Deploy Firestore", `Project: ${firebaseProjectId}`);

  if (isDryRun) {
    logWarning("PR validation mode - no changes will be made");
  }

  await deployFirestore(firebaseProjectId, isDryRun);

  if (isDryRun) {
    logSuccess("Firestore validation completed successfully!");
  } else {
    logSuccess("Firestore rules and indexes deployed successfully!");
  }
}

async function deployInfrastructureComponent(
  args: DeployArgs,
  projectId: string,
  firebaseProjectId: string,
): Promise<void> {
  const envConfig = loadEnvironment(args.env);
  const isDryRun = Boolean(args.prNumber);

  logStep("Deploy Infrastructure", `Environment: ${args.env}`);

  if (isDryRun) {
    logWarning("PR validation mode - showing plan only");
    await planInfrastructure(envConfig, projectId, firebaseProjectId);
    logSuccess("Infrastructure plan completed!");
    return;
  }

  await deployInfrastructure(envConfig, projectId, firebaseProjectId);
  logSuccess("Infrastructure deployed successfully!");
}

async function deployFullStack(
  args: DeployArgs,
  projectId: string,
  firebaseProjectId: string,
): Promise<void> {
  logStep("Deploy Full Stack", `Environment: ${args.env}, Version: ${args.version || "latest"}`);

  if (args.prNumber) {
    logWarning("PR validation mode - building and validating only");
  }

  await deployAPI(args, projectId, firebaseProjectId);
  await deployFunctionsComponent(args, firebaseProjectId);
  await deployClient(args);

  if (args.prNumber) {
    logSuccess(`Full stack validation completed for ${args.env}!`);
  } else {
    logSuccess(`Full stack deployed successfully for ${args.env}!`);
  }
}

async function main(): Promise<void> {
  try {
    const args = parseArguments();

    const projectId = process.env.GCP_PROJECT_ID || process.env.PROJECT_ID;
    const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "auto-gm-372620";

    logStep("Configuration", `Component: ${args.component}, Environment: ${args.env}`);

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
        await deployFirestoreComponent(args, firebaseProjectId);
        break;
      case "infrastructure":
        if (!projectId) {
          throw new Error(
            "GCP_PROJECT_ID or PROJECT_ID environment variable required for infrastructure deployment",
          );
        }
        await deployInfrastructureComponent(args, projectId, firebaseProjectId);
        break;
      case "mutation-api":
        if (!projectId) {
          throw new Error(
            "GCP_PROJECT_ID or PROJECT_ID environment variable required for Mutation API deployment",
          );
        }
        if (args.env !== "prod") {
          throw new Error('Only "prod" environment is supported for mutation-api');
        }
        await deployMutationAPI(
          {
            env: "prod",
            version: args.version,
            prNumber: args.prNumber,
            skipBuild: args.skipBuild,
            skipDeploy: args.skipDeploy,
          },
          projectId,
        );
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

// Only run main() when this file is executed directly, not when imported
if (import.meta.main) {
  main().catch(console.error);
}
