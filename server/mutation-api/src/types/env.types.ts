export interface Env {
  PORT: string;
  NODE_ENV: "development" | "production";
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  CLOUD_TASKS_QUEUE_PATH: string;
  CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL: string;
  ALLOWED_ORIGINS: string;
}
