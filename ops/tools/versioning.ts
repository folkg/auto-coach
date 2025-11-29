import { $ } from "bun";

export async function getGitShortSHA(): Promise<string> {
  const result = await $`git rev-parse --short HEAD`.text();
  return result.toString().trim();
}

export async function determineContainerTags(
  env: "dev" | "prod",
  version?: string,
): Promise<string[]> {
  if (env === "dev") {
    const shortSHA = await getGitShortSHA();
    return [`dev-${shortSHA}`, "dev-latest"];
  }

  if (!version) {
    throw new Error("Version required for prod deployment (e.g., --version v1.2.3)");
  }

  if (!version.match(/^v\d+\.\d+\.\d+$/)) {
    throw new Error(`Invalid version format: ${version}. Expected format: v1.2.3`);
  }

  return [version, "prod-latest"];
}

export function getPrimaryTag(tags: readonly string[]): string {
  const tag = tags[0];
  if (!tag) {
    throw new Error("No tags provided");
  }
  return tag;
}
