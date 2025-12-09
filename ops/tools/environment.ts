import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import type { EnvironmentConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadEnvironment(env: "prod"): EnvironmentConfig {
  const configPath = resolve(__dirname, "../environments", `${env}.yaml`);
  const raw = readFileSync(configPath, "utf-8");
  const config = parse(raw) as EnvironmentConfig;
  return config;
}
