#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { $ } from "bun";
import { loadEnvironment } from "./environment";
import { log, logError, logStep, logSuccess, logWarning } from "./log";
import { applyInfrastructure } from "./tofu";
import { determineContainerTags, getPrimaryTag } from "./versioning";

interface DeployMutationAPIArgs {
  env: "dev" | "prod";
  version?: string;
  dryRun: boolean;
  skipBuild: boolean;
  skipInfra: boolean;
}

function parseArguments(): DeployMutationAPIArgs {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      env: { type: "string", short: "e" },
      version: { type: "string", short: "v" },
      "dry-run": { type: "boolean", default: false },
      "skip-build": { type: "boolean", default: false },
      "skip-infra": { type: "boolean", default: false },
    },
  });

  const env = (values.env as "dev" | "prod") || "dev";
  if (!["dev", "prod"].includes(env)) {
    throw new Error('Environment must be "dev" or "prod"');
  }

  return {
    env,
    version: values.version as string | undefined,
    dryRun: values["dry-run"] as boolean,
    skipBuild: values["skip-build"] as boolean,
    skipInfra: values["skip-infra"] as boolean,
  };
}

async function buildMutationAPI(): Promise<void> {
  logStep("Build", "Building Mutation API binary...");

  const { resolve } = await import("node:path");
  const projectRoot = resolve(import.meta.dir, "..", "..");

  await $`cd ${projectRoot} && bun run build:mutation-api`;
}

async function buildMutationAPIContainer(): Promise<void> {
  logStep("Docker", "Building Mutation API container...");

  const { resolve } = await import("node:path");
  const projectRoot = resolve(import.meta.dir, "..", "..");

  await $`cd ${projectRoot}/server/mutation-api && bun run container:build`;
}

async function tagMutationAPIContainer(
  containerRepo: string,
  tags: string[],
): Promise<void> {
  logStep("Docker", "Tagging Mutation API container...");

  for (const tag of tags) {
    await $`docker tag auto-coach-mutation-api ${containerRepo}/auto-coach/auto-coach-mutation-api:${tag}`;
  }
}

async function pushMutationAPIContainer(
  containerRepo: string,
  tags: string[],
): Promise<void> {
  logStep("Docker", "Pushing Mutation API container...");

  for (const tag of tags) {
    await $`docker push ${containerRepo}/auto-coach/auto-coach-mutation-api:${tag}`;
  }
}

export async function deployMutationAPI(
  args: DeployMutationAPIArgs,
  projectId: string,
  firebaseProjectId: string,
): Promise<void> {
  const envConfig = loadEnvironment(args.env);
  const tags = await determineContainerTags(args.env, args.version);
  const primaryTag = getPrimaryTag(tags);

  logStep(
    "Deploy Mutation API",
    `Environment: ${args.env}, Tags: ${tags.join(", ")}`,
  );

  if (args.dryRun) {
    logWarning("Dry run mode - no changes will be made");
    log("Would build Mutation API binary");
    log("Would build Docker container");
    log(`Would tag container: ${tags.join(", ")}`);
    log(`Would push container to ${envConfig.containerRepo}`);
    log(`Would apply OpenTofu with tag ${primaryTag}`);
    return;
  }

  if (!args.skipBuild) {
    await buildMutationAPI();
    await buildMutationAPIContainer();
  } else {
    logStep("Mutation API", "Skipping build (using existing build artifact)");
  }

  await tagMutationAPIContainer(envConfig.containerRepo, tags);
  await pushMutationAPIContainer(envConfig.containerRepo, tags);

  if (!args.skipInfra) {
    await applyInfrastructure(
      envConfig,
      primaryTag,
      projectId,
      firebaseProjectId,
    );
    const apiURL = await getMutationAPIURL();
    logSuccess("Mutation API deployed successfully!");
    log(`API URL: ${apiURL}`);
    log(`Container tags: ${tags.join(", ")}`);
  } else {
    logStep(
      "Mutation API",
      "Skipping infrastructure apply - container pushed successfully",
    );
    logSuccess("Container image ready for deployment");
    log(`Container tags: ${tags.join(", ")}`);
    log(
      `Deploy to Cloud Run with: gcloud run deploy mutation-api-${args.env} --image ${envConfig.containerRepo}/auto-coach/auto-coach-mutation-api:${primaryTag}`,
    );
  }
}

async function getMutationAPIURL(): Promise<string> {
  const projectId = process.env.GCP_PROJECT_ID || process.env.PROJECT_ID;
  const env = process.env.NODE_ENV || "dev";

  if (!projectId) {
    throw new Error(
      "GCP_PROJECT_ID or PROJECT_ID environment variable required",
    );
  }

  const result =
    await $`gcloud run services describe mutation-api-${env} --region us-central1 --project ${projectId} --format='value(status.url)'`.text();
  return result.trim();
}

async function main(): Promise<void> {
  try {
    const args = parseArguments();

    const projectId = process.env.GCP_PROJECT_ID || process.env.PROJECT_ID;
    const firebaseProjectId =
      process.env.FIREBASE_PROJECT_ID || "auto-gm-372620";

    logStep(
      "Configuration",
      `Component: mutation-api, Environment: ${args.env}`,
    );

    if (!projectId) {
      throw new Error(
        "GCP_PROJECT_ID or PROJECT_ID environment variable required for Mutation API deployment",
      );
    }

    await deployMutationAPI(args, projectId, firebaseProjectId);

    process.exit(0);
  } catch (error) {
    logError(error instanceof Error ? error.message : "Unknown error occurred");
    process.exit(1);
  }
}

main().catch(console.error);
