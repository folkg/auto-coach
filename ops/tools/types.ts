export interface EnvironmentConfig {
  readonly name: "dev" | "prod";
  readonly firebaseProject: string;
  readonly hostingSite: string;
  readonly cloudRunService: string;
  readonly region: string;
  readonly containerRepo: string;
  readonly allowedOrigins: readonly string[];
}
