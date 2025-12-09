import { $ } from "bun";

export async function getGitShortSHA(): Promise<string> {
  const result = await $`git rev-parse --short HEAD`.text();
  return result.toString().trim();
}

export interface TagOptions {
  readonly env: "prod";
  readonly version?: string;
  readonly prNumber?: string;
}

export async function determineContainerTags(options: TagOptions): Promise<string[]> {
  const { version, prNumber } = options;
  const shortSHA = await getGitShortSHA();

  // PR validation: tag with PR number and SHA
  if (prNumber) {
    return [`pr-${prNumber}-${shortSHA}`];
  }

  // Prod deployment requires a version
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
