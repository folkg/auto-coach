import { $ } from "bun";
import { resolve } from "node:path";
import { logStep } from "./log.js";

export async function buildAPI(): Promise<void> {
  logStep("API", "Building server/api binary...");
  const projectRoot = resolve(import.meta.dir, "../..");
  await $`cd ${projectRoot}/server/api && bun run build`;
}

export async function buildContainer(): Promise<void> {
  logStep("Container", "Building Docker image...");
  const projectRoot = resolve(import.meta.dir, "../..");
  await $`cd ${projectRoot} && docker build --platform linux/amd64 -f server/api/Dockerfile -t auto-coach-api .`;
}

export async function tagContainer(projectId: string, repo: string, tags: string[]): Promise<void> {
  for (const tag of tags) {
    const fullTag = `${repo}/${projectId}/auto-coach/auto-coach-api:${tag}`;
    logStep("Container", `Tagging as ${fullTag}`);
    await $`docker tag auto-coach-api ${fullTag}`;
  }
}

export async function pushContainer(
  projectId: string,
  repo: string,
  tags: string[],
): Promise<void> {
  logStep("Container", "Configuring Docker authentication...");
  await $`gcloud auth configure-docker ${repo}`;

  for (const tag of tags) {
    const fullTag = `${repo}/${projectId}/auto-coach/auto-coach-api:${tag}`;
    logStep("Container", `Pushing ${fullTag}`);
    await $`docker push ${fullTag}`;
  }
}
