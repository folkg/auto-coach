// Infrastructure configuration for Auto Coach API server deployment
// Optimized for Bun compiled binary on Google Cloud Run using Pulumi TypeScript

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

// Type-safe configuration with validation
interface Config {
  readonly projectId: string;
  readonly region: string;
  readonly environment: "dev" | "prod";
  readonly allowedOrigins: string;
  readonly firebaseProjectId: string;
}

// Environment-specific settings for optimal performance
interface EnvironmentSettings {
  readonly minInstances: number;
  readonly maxInstances: number;
  readonly memory: string;
  readonly cpu: string;
  readonly timeout: string;
  readonly allowUnauthenticated: boolean;
}

const getEnvironmentSettings = (
  env: Config["environment"],
): EnvironmentSettings => {
  switch (env) {
    case "prod":
      return {
        minInstances: 0,
        maxInstances: 100,
        memory: "512Mi",
        cpu: "1",
        timeout: "60s",
        allowUnauthenticated: false,
      };
    case "dev":
      return {
        minInstances: 0,
        maxInstances: 10,
        memory: "512Mi",
        cpu: "1",
        timeout: "60s",
        allowUnauthenticated: true,
      };
  }
};

const gcpConfig = new pulumi.Config("gcp");
const autoCoachConfig = new pulumi.Config("auto-coach");

const config: Config = {
  projectId: gcpConfig.require("project"),
  region: gcpConfig.get("region") ?? "us-central1",
  environment: (autoCoachConfig.get("environment") ??
    "dev") as Config["environment"],
  allowedOrigins:
    autoCoachConfig.get("allowedOrigins") ?? "http://localhost:4200",
  firebaseProjectId: autoCoachConfig.require("firebaseProjectId"),
};

const envSettings = getEnvironmentSettings(config.environment);

// Enable required APIs
const cloudRunApi = new gcp.projects.Service("cloud-run-api", {
  service: "run.googleapis.com",
  project: config.projectId,
});

const artifactRegistryApi = new gcp.projects.Service("artifact-registry-api", {
  service: "artifactregistry.googleapis.com",
  project: config.projectId,
});

const cloudBuildApi = new gcp.projects.Service("cloud-build-api", {
  service: "cloudbuild.googleapis.com",
  project: config.projectId,
});

// Create Artifact Registry repository for container images
const autoCoachRepo = new gcp.artifactregistry.Repository(
  "auto-coach-repo",
  {
    repositoryId: "auto-coach",
    format: "DOCKER",
    location: config.region,
    description: "Container registry for Auto Coach API",
    project: config.projectId,
  },
  { dependsOn: [artifactRegistryApi] },
);

// Service account for Cloud Run
const cloudRunServiceAccount = new gcp.serviceaccount.Account("cloud-run-sa", {
  accountId: `auto-coach-api-${config.environment}`,
  displayName: `Auto Coach API Service Account (${config.environment})`,
  description: "Service account for Auto Coach API Cloud Run service",
  project: config.projectId,
});

// IAM binding for service account to access Firebase
const firebaseViewerBinding = new gcp.projects.IAMMember(
  "cloud-run-sa-firebase-viewer",
  {
    project: config.firebaseProjectId,
    role: "roles/firebase.viewer",
    member: pulumi.interpolate`serviceAccount:${cloudRunServiceAccount.email}`,
  },
);

// Cloud Run service configuration optimized for Bun binary
const autoCoachApi = new gcp.cloudrunv2.Service(
  "auto-coach-api",
  {
    name: `auto-coach-api-${config.environment}`,
    location: config.region,
    project: config.projectId,
    template: {
      timeout: envSettings.timeout,
      executionEnvironment: "EXECUTION_ENVIRONMENT_GEN2",
      serviceAccount: cloudRunServiceAccount.email,
      containers: [
        {
          image: pulumi.interpolate`${config.region}-docker.pkg.dev/${config.projectId}/${autoCoachRepo.repositoryId}/auto-coach-api:latest`,
          resources: {
            limits: {
              cpu: envSettings.cpu,
              memory: envSettings.memory,
            },
            cpuIdle: false, // Disable CPU throttling for faster cold starts
          },
          ports: {
            containerPort: 3000,
            name: "http1",
          },
          envs: [
            {
              name: "ALLOWED_ORIGINS",
              value: config.allowedOrigins,
            },
            {
              name: "FIREBASE_PROJECT_ID",
              value: config.firebaseProjectId,
            },
            {
              name: "NODE_ENV",
              value:
                config.environment === "prod" ? "production" : "development",
            },
            {
              name: "PORT",
              value: "3000",
            },
          ],
          // Health probes optimized for compiled binary startup
          startupProbe: {
            httpGet: {
              path: "/",
              port: 3000,
              httpHeaders: [
                {
                  name: "User-Agent",
                  value: "GoogleHC/1.0",
                },
              ],
            },
            initialDelaySeconds: 1,
            timeoutSeconds: 3,
            periodSeconds: 2,
            failureThreshold: 3,
          },
          livenessProbe: {
            httpGet: {
              path: "/",
              port: 3000,
              httpHeaders: [
                {
                  name: "User-Agent",
                  value: "GoogleHC/1.0",
                },
              ],
            },
            initialDelaySeconds: 10,
            timeoutSeconds: 5,
            periodSeconds: 30,
            failureThreshold: 3,
          },
        },
      ],
      scaling: {
        minInstanceCount: envSettings.minInstances,
        maxInstanceCount: envSettings.maxInstances,
      },
    },
    traffics: [
      {
        percent: 100,
        type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
      },
    ],
  },
  {
    dependsOn: [
      cloudRunApi,
      autoCoachRepo,
      cloudBuildApi,
      firebaseViewerBinding,
    ],
  },
);

// IAM policy based on environment
if (envSettings.allowUnauthenticated) {
  new gcp.cloudrunv2.ServiceIamMember("public-access", {
    name: autoCoachApi.name,
    location: autoCoachApi.location,
    project: config.projectId,
    role: "roles/run.invoker",
    member: "allUsers",
  });
} else {
  new gcp.cloudrunv2.ServiceIamMember("authenticated-access", {
    name: autoCoachApi.name,
    location: autoCoachApi.location,
    project: config.projectId,
    role: "roles/run.invoker",
    member: "allAuthenticatedUsers",
  });
}

// Type-safe outputs with comprehensive information
interface InfrastructureOutputs {
  readonly serviceUrl: pulumi.Output<string>;
  readonly containerRegistryUrl: pulumi.Output<string>;
  readonly serviceAccountEmail: pulumi.Output<string>;
  readonly environment: pulumi.Output<string>;
  readonly region: pulumi.Output<string>;
}

const outputs: InfrastructureOutputs = {
  serviceUrl: autoCoachApi.uri,
  containerRegistryUrl: pulumi.interpolate`${config.region}-docker.pkg.dev/${config.projectId}/${autoCoachRepo.repositoryId}`,
  serviceAccountEmail: cloudRunServiceAccount.email,
  environment: pulumi.output(config.environment),
  region: pulumi.output(config.region),
};

// Export outputs for external consumption
export const serviceUrl = outputs.serviceUrl;
export const containerRegistryUrl = outputs.containerRegistryUrl;
export const serviceAccountEmail = outputs.serviceAccountEmail;
export const environment = outputs.environment;
export const region = outputs.region;
