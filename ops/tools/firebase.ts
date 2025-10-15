import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { $ } from "bun";
import { logStep } from "./log.ts";
import type { EnvironmentConfig } from "./types.ts";

export async function buildClient(): Promise<void> {
  logStep("Client", "Building Angular client...");
  const projectRoot = resolve(import.meta.dir, "../..");
  await $`cd ${projectRoot} && bun run build:client`;
}

export async function deployHosting(
  env: EnvironmentConfig,
  channel?: string,
): Promise<string> {
  const projectRoot = resolve(import.meta.dir, "../..");
  const configSource = resolve(projectRoot, `firebase.app-${env.name}.json`);
  const configDest = resolve(projectRoot, "firebase.generated.json");

  copyFileSync(configSource, configDest);

  if (channel) {
    logStep(
      "Hosting",
      `Deploying to preview channel: ${channel} (site: ${env.hostingSite})...`,
    );
    const result =
      await $`cd ${projectRoot} && firebase hosting:channel:deploy ${channel} --expires 30d --config firebase.generated.json --project ${env.firebaseProject}`.text();
    return result;
  }

  logStep("Hosting", `Deploying to live site: ${env.hostingSite}...`);
  const result =
    await $`cd ${projectRoot} && firebase deploy --only hosting --config firebase.generated.json --project ${env.firebaseProject}`.text();
  return result;
}

export async function deployFunctions(projectId: string): Promise<void> {
  logStep("Functions", "Deploying Firebase Functions...");
  const projectRoot = resolve(import.meta.dir, "../..");
  await $`cd ${projectRoot} && firebase deploy --only functions --project ${projectId}`;
}

export async function deployFirestore(projectId: string): Promise<void> {
  logStep("Firestore", "Deploying Firestore rules and indexes...");
  const projectRoot = resolve(import.meta.dir, "../..");
  await $`cd ${projectRoot} && firebase deploy --only firestore --project ${projectId}`;
}
