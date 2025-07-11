declare interface Env {
  readonly NODE_ENV: string;
  readonly NG_APP_FIREBASE_API_KEY: string;
  readonly NG_APP_FIREBASE_AUTH_DOMAIN: string;
  readonly NG_APP_FIREBASE_PROJECT_ID: string;
  readonly NG_APP_FIREBASE_STORAGE_BUCKET: string;
  readonly NG_APP_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly NG_APP_FIREBASE_APP_ID: string;
  readonly NG_APP_API_BASE_URL: string;
}

declare interface ImportMeta {
  readonly env: Env;
}
