import { $ } from "bun";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

import type { EnvironmentConfig } from "./types";

import { logStep } from "./log";

export async function buildClient(): Promise<void> {
  logStep("Client", "Building Angular client for production...");
  const projectRoot = resolve(import.meta.dir, "../..");
  // NG_APP_ENV=production tells @ngx-env/builder to use .env.production
  await $`cd ${projectRoot} && NG_APP_ENV=production bun run build:client`;
}

export async function deployHosting(
  env: EnvironmentConfig,
  channel?: string,
  dryRun = false,
): Promise<string> {
  const projectRoot = resolve(import.meta.dir, "../..");
  const configSource = resolve(projectRoot, `firebase.app-${env.name}.json`);
  const configDest = resolve(projectRoot, "firebase.generated.json");

  copyFileSync(configSource, configDest);

  if (channel) {
    logStep("Hosting", `Deploying to preview channel: ${channel} (site: ${env.hostingSite})...`);
    const result =
      await $`cd ${projectRoot} && bunx firebase-tools hosting:channel:deploy ${channel} --expires 30d --config firebase.generated.json --project ${env.firebaseProject}`.text();
    return result;
  }

  if (dryRun) {
    logStep("Hosting", `Validating deployment to site: ${env.hostingSite} (dry-run)...`);
    try {
      const result =
        await $`cd ${projectRoot} && bunx firebase-tools deploy --only hosting --config firebase.generated.json --project ${env.firebaseProject} --dry-run`.text();
      return result;
    } catch (error) {
      console.error("Firebase hosting dry-run failed:");
      console.error(error);
      throw error;
    }
  }

  logStep("Hosting", `Deploying to live site: ${env.hostingSite}...`);
  try {
    const result =
      await $`cd ${projectRoot} && bunx firebase-tools deploy --only hosting --config firebase.generated.json --project ${env.firebaseProject}`
        .env({
          ...process.env,
          GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
        })
        .text();
    return result;
  } catch (error) {
    console.error("Firebase hosting deployment failed:");
    console.error(error);
    throw error;
  }
}

export async function deployFunctions(projectId: string, dryRun = false): Promise<void> {
  if (dryRun) {
    logStep("Functions", "Validating Firebase Functions (dry-run)...");
    const projectRoot = resolve(import.meta.dir, "../..");
    await $`cd ${projectRoot} && bunx firebase-tools deploy --only functions --project ${projectId} --dry-run`;
    return;
  }

  logStep("Functions", "Deploying Firebase Functions...");
  const projectRoot = resolve(import.meta.dir, "../..");
  await $`cd ${projectRoot} && GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS} bunx firebase-tools deploy --only functions --project ${projectId}`;
}

export async function deployFirestore(projectId: string, dryRun = false): Promise<void> {
  if (dryRun) {
    logStep("Firestore", "Validating Firestore rules and indexes (dry-run)...");
    const projectRoot = resolve(import.meta.dir, "../..");
    await $`cd ${projectRoot} && bunx firebase-tools deploy --only firestore --project ${projectId} --dry-run`;
    return;
  }

  logStep("Firestore", "Deploying Firestore rules and indexes...");
  const projectRoot = resolve(import.meta.dir, "../..");
  await $`cd ${projectRoot} && bunx firebase-tools deploy --only firestore --project ${projectId}`;
}
