import { resolve } from "node:path";
import { $ } from "bun";
import { logStep } from "./log";
import type { EnvironmentConfig } from "./types";

export async function applyInfrastructure(
  env: EnvironmentConfig,
  containerTag: string,
  projectId: string,
  firebaseProjectId: string,
): Promise<void> {
  logStep(
    "OpenTofu",
    `Applying infrastructure for ${env.name} with tag ${containerTag}...`,
  );

  const projectRoot = resolve(import.meta.dir, "../..");
  const varsFile = `environments/${env.name}.tfvars`;
  const allowedOrigins = env.allowedOrigins.join(",");

  const yahooAppId = process.env.YAHOO_APP_ID || "";
  const yahooClientId = process.env.YAHOO_CLIENT_ID || "";
  const yahooClientSecret = process.env.YAHOO_CLIENT_SECRET || "";
  const sendgridApiKey = process.env.SENDGRID_API_KEY || "";

  if (!(yahooAppId && yahooClientId && yahooClientSecret && sendgridApiKey)) {
    throw new Error(
      "Missing required environment variables: YAHOO_APP_ID, YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, SENDGRID_API_KEY",
    );
  }

  await $`cd ${projectRoot}/infrastructure/opentofu && tofu apply \
    -var-file=${varsFile} \
    -var="container_image_tag=${containerTag}" \
    -var="project_id=${projectId}" \
    -var="firebase_project_id=${firebaseProjectId}" \
    -var="allowed_origins=${allowedOrigins}" \
    -var="yahoo_app_id=${yahooAppId}" \
    -var="yahoo_client_id=${yahooClientId}" \
    -var="yahoo_client_secret=${yahooClientSecret}" \
    -var="sendgrid_api_key=${sendgridApiKey}" \
    -auto-approve`;
}

export async function getAPIURL(): Promise<string> {
  const projectRoot = resolve(import.meta.dir, "../..");
  const result =
    await $`cd ${projectRoot}/infrastructure/opentofu && tofu output -raw api_url`.text();
  return result.trim();
}
