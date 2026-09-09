# Operations Guide

Unified deployment orchestrator for Auto Coach infrastructure.

## Prerequisites

### Required Environment Variables

Before deploying the API, you must set these environment variables:

```bash
# Copy the example file
cp .env.deployment.example .env.deployment

# Edit with your actual values
# Then source it:
source .env.deployment
```

Required variables:

- `GCP_PROJECT_ID` - Google Cloud project ID
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `YAHOO_APP_ID` - Yahoo Fantasy API app ID
- `YAHOO_CLIENT_ID` - Yahoo Fantasy API client ID
- `YAHOO_CLIENT_SECRET` - Yahoo Fantasy API client secret
- `SENDGRID_API_KEY` - SendGrid API key for emails

**Note:** Client and Functions deployments don't require these variables.

## Quick Start

```bash
# Set up environment variables (first time only)
source .env.deployment

# Run checks before a deployment
bun run checks:ci

# Deploy a versioned API to prod
bun run deploy -- --component api --env prod --version v1.2.3

# Deploy the client to prod
bun run deploy -- --component client --env prod
```

## Commands

### Deploy API

```bash
bun run deploy -- --component api --env prod --version v1.2.3
```

Builds, containerizes, and deploys the API service to Cloud Run. A semantic `--version` is required for API, Mutation API, and full-stack deployments.

### Deploy Mutation API

```bash
bun run deploy -- --component mutation-api --env prod --version v1.2.3
```

Builds, containerizes, and deploys the Mutation API service to Cloud Run.

**Key details:**

- Only `prod` environment is supported (no dev environment exists).
- The service is `mutation-api-prod`.
- Deployment is performed directly with `gcloud run deploy` to avoid shared container-tag conflicts.

### Deploy Client

```bash
bun run deploy -- --component client --env prod [--channel <name>]
```

Builds and deploys the Angular client to Firebase Hosting.

**Prod deployment:**

- Site: `auto-gm-372620`.
- Rewrites `/api/**` to `auto-coach-api-prod`.
- Use `--channel` only for an explicitly authorized Firebase Hosting preview channel.
- Without `--channel`, deploys to the live channel.

### Deploy Functions

```bash
bun run deploy -- --component functions --env prod
```

Builds and deploys Firebase Functions.

### Deploy Firestore

```bash
bun run deploy -- --component firestore --env prod
```

Deploys Firestore rules and indexes.

### Deploy Infrastructure

```bash
bun run deploy -- --component infrastructure --env prod
```

Plans and applies the OpenTofu-managed infrastructure. This component requires the Yahoo and SendGrid values listed above.

### Deploy Full Stack

```bash
bun run deploy -- --component full --env prod --version v1.2.3
```

Deploys API, Functions, and Client in sequence. Deploy infrastructure separately with `--component infrastructure`.

## Options

- `--env, -e`: Environment (`prod`).
- `--version, -v`: Semantic version for API, Mutation API, or full-stack deployments.
- `--channel, -c`: Firebase Hosting channel name for a client deployment.
- `--skip-build`: Use existing build artifacts.
- `--skip-deploy`: Build and validate without applying a deployment where supported.

The deploy CLI does not provide a no-op dry-run for every component. Run the relevant checks and builds before deploying.

## Environment Configuration

Environment is defined in YAML:

- `ops/environments/prod.yaml`

The environment specifies:

- Firebase project and hosting site
- Cloud Run service name and region
- Container repository
- Allowed CORS origins

## Architecture

### Multi-Site Hosting + Rewrites

The client uses **relative `/api` calls** (no hardcoded API URLs).

Firebase Hosting rewrites proxy `/api/**` to the Cloud Run service:

- **auto-gm-372620** site -> rewrites to `auto-coach-api-prod`

This eliminates the need to inject API URLs at build time.

### Container Tagging Strategy

**Production:**

- Primary: `v1.2.3` (semantic version)
- Latest: `prod-latest`

### File Structure

```
ops/
├── deploy.ts              # CLI orchestrator
├── lib/
│   ├── docker.ts          # Container build/push
│   ├── firebase.ts        # Hosting/functions deployment
│   ├── tofu.ts            # OpenTofu infrastructure
│   ├── environment.ts     # Config loading
│   ├── versioning.ts      # Tag generation
│   ├── log.ts             # Logging utilities
│   └── types.ts           # TypeScript types
├── environments/
│   └── prod.yaml          # Prod environment config
├── package.json
└── tsconfig.json
```

## CI/CD Integration

Pull requests run unprivileged validation in `.github/workflows/ci.yml`. They do not deploy, receive production credentials, or access production Firebase resources.

Changes merged to the protected `main` branch can trigger the component-specific production workflows:

- `deploy-api.yml` for the API service;
- `deploy-mutation-api.yml` for the mutation API;
- `deploy-client.yml` for Firebase Hosting;
- `deploy-functions.yml` for Firebase Functions;
- `deploy-firestore.yml` for Firestore rules and indexes; and
- `deploy-infrastructure.yml` for OpenTofu-managed infrastructure.

Each production workflow uses the `production` GitHub environment. The environment requires maintainer approval and is restricted to protected branches. Manual dispatch is available to the maintainer when an explicit deployment is needed.

## Required Environment Variables

For local deployments, copy `.env.deployment.example` to `.env.deployment`, fill it with credentials for the intended project, and source it:

```bash
cp .env.deployment.example .env.deployment
source .env.deployment
```

Required values include:

- `GCP_PROJECT_ID` and `FIREBASE_PROJECT_ID`;
- `YAHOO_APP_ID`, `YAHOO_CLIENT_ID`, and `YAHOO_CLIENT_SECRET`; and
- `SENDGRID_API_KEY`.

Do not use these credentials for pull-request tests. Never commit `.env.deployment` or service-account files.

## Examples

**Deploy the API with a version:**

```bash
bun run checks:ci
bun run deploy -- --component api --env prod --version v1.2.3
```

**Deploy the mutation API:**

```bash
bun run deploy -- --component mutation-api --env prod --version v1.2.3
```

**Deploy the client:**

```bash
bun run deploy -- --component client --env prod
```

**Deploy the full stack:**

```bash
bun run checks:ci
bun run deploy -- --component full --env prod --version v2.0.0
```

Use `--skip-build` or `--skip-deploy` only when the consequences are understood. The deploy CLI does not provide a no-op dry-run for every component; prefer running the relevant build and CI checks before a production deployment.

## Troubleshooting

**Check Cloud Run status:**

```bash
gcloud run services list --region us-central1
```

**View OpenTofu outputs:**

```bash
cd infrastructure/opentofu && tofu output
```

**List Firebase hosting sites:**

```bash
firebase hosting:sites:list
```

**Check API health:**

```bash
curl https://auto-coach-api-prod-xxxxx.run.app/health
```

## Development Workflow

1. Make code changes using a development project or emulator.
2. Run `bun run checks:ci` and relevant builds.
3. Open a pull request; only unprivileged validation runs.
4. Obtain required maintainer approval and resolve all conversations.
5. Merge with squash merging; production deployment then requires the protected environment approval.
