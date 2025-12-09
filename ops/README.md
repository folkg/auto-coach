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

# Deploy API to prod
bun run deploy:api:prod

# Deploy client to prod
bun run deploy:client:prod

# Deploy full stack to prod with version
bun run deploy:full:prod --version v1.2.3

# Test deployment without changes
bun run deploy api --env prod --version v1.2.3 --dry-run
```

## Commands

### Deploy API

```bash
bun run deploy api --env prod [--version v1.2.3]
```

Builds, containerizes, and deploys the API service to Cloud Run.

**Prod deployment:**

- Tags: `v1.2.3`, `prod-latest`
- Cloud Run service: `auto-coach-api-prod`
- **Requires:** `--version` flag with semantic version (e.g., v1.2.3)

### Deploy Mutation API

```bash
bun run deploy:mutation-api:prod --version v1.2.3
```

Builds, containerizes, and deploys the Mutation API service to Cloud Run.

**Key details:**

- Only `prod` environment is supported (no dev environment exists)
- Tags: `v1.2.3`, `prod-latest`
- Cloud Run service: `mutation-api-prod`
- **Requires:** `--version` flag with semantic version (e.g., v1.2.3)
- Deploys directly via `gcloud run deploy` (not OpenTofu, to avoid shared tag conflicts)

**Options:**

- `--version, -v`: Required semantic version (e.g., v1.2.3)
- `--skip-build`: Skip building, use existing container image
- `--dry-run`: Test deployment without making changes

### Deploy Client

```bash
bun run deploy client --env prod [--channel <name>]
```

Builds and deploys the Angular client to Firebase Hosting.

**Prod deployment:**

- Site: `app-prod`
- Rewrites `/api/**` to `auto-coach-api-prod`
- Use `--channel` for preview channels (e.g., `--channel pr-123`)
- Deploys to live channel

### Deploy Functions

```bash
bun run deploy functions --env <prod>
```

Builds and deploys Firebase Functions.

### Deploy Firestore

```bash
bun run deploy firestore --env <prod>
```

Deploys Firestore rules and indexes.

### Deploy Full Stack

```bash
bun run deploy full --env prod [--version v1.2.3]
```

Deploys API, Functions, and Client in sequence.

**Requires:** `--version` flag

## Options

- `--env, -e`: Environment (`prod`)
- `--version, -v`: Semantic version for deployments (e.g., `v1.2.3`)
- `--channel, -c`: Preview channel name for client deployments
- `--dry-run`: Test deployment without making changes

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

- **app-prod** site -> rewrites to `auto-coach-api-prod`

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
│   ├── dev.yaml           # Dev environment config
│   └── prod.yaml          # Prod environment config
├── package.json
└── tsconfig.json
```

## CI/CD Integration

The `.github/workflows/ci.yml` workflow uses the orchestrator for automated deployments:

**On push to main:**

- Detects changed components
- Runs tests and builds
- Deploys to production using orchestrator

**On pull requests:**

- Deploys client preview

## Required Environment Variables

Set these before deploying:

```bash
export GCP_PROJECT_ID="your-gcp-project-id"
export FIREBASE_PROJECT_ID="auto-gm-372620"
```

**For manual API deployments, also set:**

```bash
export YAHOO_APP_ID="..."
export YAHOO_CLIENT_ID="..."
export YAHOO_CLIENT_SECRET="..."
export SENDGRID_API_KEY="..."
```

(CI sets these from GitHub secrets)

## Examples

**Deploy API with version:**

```bash
bun run checks
bun run deploy api --env prod --version v1.2.3
```

**Deploy client preview for PR:**

```bash
bun run deploy client --env prod --channel pr-456
```

**Full prod deployment:**

```bash
bun run checks
bun run deploy full --env prod --version v2.0.0
```

**Dry run to test prod deployment:**

```bash
bun run deploy full --env prod --version v2.0.0 --dry-run
```

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

**Check active preview channels:**

```bash
firebase hosting:channel:list
```

**Test API health:**

```bash
curl https://auto-coach-api-prod-xxxxx.run.app/health
```

## Development Workflow

1. Make code changes
2. Run checks: `bun run checks`
3. Test locally
4. Create PR (triggers preview deployment)
5. Merge to main (auto-deploys to prod)

---

For full deployment guide, see [DEPLOYMENT.md](../DEPLOYMENT.md)
