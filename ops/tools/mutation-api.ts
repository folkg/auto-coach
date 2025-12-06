#!/usr/bin/env bun
import { $ } from "bun";
import { parseArgs } from "node:util";

import { loadEnvironment } from "./environment";
import { log, logError, logStep, logSuccess, logWarning } from "./log";
import { determineContainerTags, getPrimaryTag } from "./versioning";

interface DeployMutationAPIArgs {
  readonly env: "prod";
  readonly version?: string;
  readonly dryRun: boolean;
  readonly skipBuild: boolean;
}

function parseArguments(): DeployMutationAPIArgs {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      env: { type: "string", short: "e" },
      version: { type: "string", short: "v" },
      "dry-run": { type: "boolean", default: false },
      "skip-build": { type: "boolean", default: false },
    },
  });

  const env = values.env as string | undefined;
  if (env && env !== "prod") {
    throw new Error('Only "prod" environment is supported for mutation-api');
  }

  return {
    env: "prod",
    version: values.version as string | undefined,
    dryRun: values["dry-run"] as boolean,
    skipBuild: values["skip-build"] as boolean,
  };
}

async function buildMutationAPI(): Promise<void> {
  logStep("Build", "Building Mutation API binary...");

  const { resolve } = await import("node:path");
  const projectRoot = resolve(import.meta.dir, "..", "..");

  await $`cd ${projectRoot} && bun run build:mutation-api`;
}

async function buildMutationAPIContainer(): Promise<void> {
  logStep("Docker", "Building Mutation API container for linux/amd64...");

  const { resolve } = await import("node:path");
  const projectRoot = resolve(import.meta.dir, "..", "..");

  await $`cd ${projectRoot} && bun run container:build:mutation-api:cloud`;
}

async function tagMutationAPIContainer(
  projectId: string,
  containerRepo: string,
  tags: string[],
): Promise<void> {
  logStep("Docker", "Tagging Mutation API container...");

  for (const tag of tags) {
    const fullTag = `${containerRepo}/${projectId}/auto-coach/auto-coach-mutation-api:${tag}`;
    logStep("Docker", `Tagging as ${fullTag}`);
    await $`docker tag auto-coach-mutation-api ${fullTag}`;
  }
}

async function pushMutationAPIContainer(
  projectId: string,
  containerRepo: string,
  tags: string[],
): Promise<void> {
  logStep("Docker", "Configuring Docker authentication...");
  await $`gcloud auth configure-docker ${containerRepo}`;

  logStep("Docker", "Pushing Mutation API container...");

  for (const tag of tags) {
    const fullTag = `${containerRepo}/${projectId}/auto-coach/auto-coach-mutation-api:${tag}`;
    logStep("Docker", `Pushing ${fullTag}`);
    await $`docker push ${fullTag}`;
  }
}

export async function deployMutationAPI(
  args: DeployMutationAPIArgs,
  projectId: string,
): Promise<void> {
  const envConfig = loadEnvironment(args.env);
  const tags = await determineContainerTags(args.env, args.version);
  const primaryTag = getPrimaryTag(tags);
  const fullImagePath = `${envConfig.containerRepo}/${projectId}/auto-coach/auto-coach-mutation-api:${primaryTag}`;

  logStep("Deploy Mutation API", `Environment: ${args.env}, Tags: ${tags.join(", ")}`);

  if (args.dryRun) {
    logWarning("Dry run mode - no changes will be made");
    log("Would build Mutation API binary");
    log("Would build Docker container for linux/amd64");
    log(`Would tag container: ${tags.join(", ")}`);
    log(`Would push container to ${envConfig.containerRepo}/${projectId}/auto-coach`);
    log(`Would deploy to Cloud Run: mutation-api-${args.env}`);
    return;
  }

  if (!args.skipBuild) {
    await buildMutationAPI();
    await buildMutationAPIContainer();
  } else {
    logStep("Mutation API", "Skipping build (using existing build artifact)");
  }

  await tagMutationAPIContainer(projectId, envConfig.containerRepo, tags);
  await pushMutationAPIContainer(projectId, envConfig.containerRepo, tags);

  // Deploy directly to Cloud Run using gcloud (avoids OpenTofu shared tag issues)
  logStep("Cloud Run", `Deploying mutation-api-${args.env}...`);
  await $`gcloud run deploy mutation-api-${args.env} --image ${fullImagePath} --region us-central1 --project ${projectId}`;

  const apiURL = await getMutationAPIURL(projectId);
  logSuccess("Mutation API deployed successfully!");
  log(`API URL: ${apiURL}`);
  log(`Container tags: ${tags.join(", ")}`);
}

async function getMutationAPIURL(projectId: string): Promise<string> {
  const result =
    await $`gcloud run services describe mutation-api-prod --region us-central1 --project ${projectId} --format='value(status.url)'`.text();
  return result.trim();
}

async function main(): Promise<void> {
  try {
    const args = parseArguments();

    const projectId = process.env.GCP_PROJECT_ID || process.env.PROJECT_ID;

    logStep("Configuration", `Component: mutation-api, Environment: ${args.env}`);

    if (!projectId) {
      throw new Error(
        "GCP_PROJECT_ID or PROJECT_ID environment variable required for Mutation API deployment",
      );
    }

    await deployMutationAPI(args, projectId);

    process.exit(0);
  } catch (error) {
    logError(error instanceof Error ? error.message : "Unknown error occurred");
    process.exit(1);
  }
}

main().catch(console.error);
