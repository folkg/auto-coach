# Complete Deployment Guide

This guide covers deploying all components of Auto Coach: Cloud Run API (via OpenTofu), Firebase Functions, and Firebase Hosting (client).

## 🏗️ Architecture Overview

Auto Coach uses a **hybrid deployment model**:

1. **Cloud Run API** (Bun/Hono) - Deployed via OpenTofu/Terraform
   - Handles: `/api/teams`, `/api/schedules`, `/api/transactions`, `/api/feedback`
   - Language: TypeScript (Bun runtime)
   - Location: `server/api/`

2. **Firebase Functions** (Node.js) - Deployed via Firebase CLI
   - Handles: Scheduled lineup optimizations, email notifications, background jobs
   - Language: TypeScript (Node runtime)
   - Location: `server/functions/`

3. **Firebase Hosting** (Static Site) - Deployed via Firebase CLI
   - Hosts: Angular client application
   - Location: `client/dist/auto-gm/browser/`

4. **Firestore Database** - Managed via Firebase Console + Rules
   - Rules deployed via Firebase CLI
   - Location: `firestore.rules`, `firestore.indexes.json`

## 📋 Prerequisites

### Required Tools
- [Node.js](https://nodejs.org/) (v18 or later)
- [Bun](https://bun.sh/) (for building)
- [Firebase CLI](https://firebase.google.com/docs/cli) (for Firebase deployments)
- [OpenTofu](https://opentofu.org/) (for Cloud Run)
- [Docker](https://www.docker.com/) (for containers)
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (for Cloud Run)

### Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Authenticate

```bash
# Firebase authentication
firebase login

# Google Cloud authentication (for OpenTofu)
gcloud auth login
gcloud auth application-default login
```

## 🚀 Deployment Order

**Important:** Deploy in this order to avoid issues:

1. ✅ Cloud Run API (OpenTofu)
2. ✅ Firebase Functions
3. ✅ Firebase Hosting (Client)
4. ✅ Firestore Rules

## 1️⃣ Cloud Run API Deployment (OpenTofu)

**See detailed guide:** [`infrastructure/opentofu/README.md`](infrastructure/opentofu/README.md)

### Quick Start

```bash
# Set environment variables
export PROJECT_ID="your-gcp-project-id"
export FIREBASE_PROJECT_ID="your-firebase-project-id"
export YAHOO_APP_ID="your-yahoo-app-id"
export YAHOO_CLIENT_ID="your-yahoo-client-id"
export SENDGRID_API_KEY="SG.your-key"
export YAHOO_CLIENT_SECRET="your-secret"

# Build API binary
cd server/api
bun run build
cd ../../

# Build container
bun run container:build

# Initialize OpenTofu
bun infra:init

# Deploy infrastructure
cd infrastructure/opentofu
tofu apply \
  -var-file="environments/dev.tfvars" \
  -var="project_id=$PROJECT_ID" \
  -var="firebase_project_id=$FIREBASE_PROJECT_ID" \
  -var="yahoo_app_id=$YAHOO_APP_ID" \
  -var="yahoo_client_id=$YAHOO_CLIENT_ID" \
  -var="sendgrid_api_key=$SENDGRID_API_KEY" \
  -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET"

# Push container
cd ../../
gcloud auth configure-docker us-central1-docker.pkg.dev
docker tag auto-coach-api us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:latest
docker push us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:latest

# Update Cloud Run
cd infrastructure/opentofu
tofu apply -var="container_image_tag=latest" [... other vars ...]

# Get API URL
API_URL=$(tofu output -raw api_url)
echo "API URL: $API_URL"
```

## 2️⃣ Firebase Functions Deployment

Firebase Functions handle background tasks like lineup optimizations and email notifications.

### Setup Firebase Project

```bash
# Check current project
firebase projects:list

# Select your project
firebase use your-firebase-project-id

# Or create an alias
firebase use --add
# Choose project, name it "prod" or "dev"
```

### Build Functions

```bash
# Build TypeScript functions
bun run build

# Functions are compiled to server/functions/lib/
```

### Deploy Functions

**Deploy all functions:**
```bash
bun firebase:deploy:functions
# or
firebase deploy --only functions
```

**Deploy specific functions:**
```bash
# Lineup functions
firebase deploy --only functions:dispatchSetLineup,functions:mockDispatchSetLineup

# Email functions
firebase deploy --only functions:sendFeedbackEmail

# Transaction functions
firebase deploy --only functions:processTransactions
```

### Verify Functions Deployment

```bash
# List deployed functions
firebase functions:list

# View function logs
firebase functions:log

# Test a function (if HTTP callable)
curl https://us-central1-your-project.cloudfunctions.net/yourFunction
```

### Function Environment Configuration

Functions use environment variables set in Firebase:

```bash
# View current config
firebase functions:config:get

# Set configuration (if needed)
firebase functions:config:set sendgrid.api_key="YOUR_KEY"
firebase functions:config:set yahoo.client_id="YOUR_ID"

# Deploy after config changes
firebase deploy --only functions
```

**Note:** Functions now read from Google Secret Manager (set up via OpenTofu), so most env config is not needed.

## 3️⃣ Firebase Hosting (Client) Deployment

### Build Client

**Important:** Build with the correct API URL from Cloud Run.

```bash
# Get API URL from OpenTofu
cd infrastructure/opentofu
export API_URL=$(tofu output -raw api_url)
cd ../../

# Build client with API URL
NG_APP_API_BASE_URL="$API_URL" bun run build:client
```

**For local development:**
```bash
# Use local API
NG_APP_API_BASE_URL="http://localhost:3000" bun run build:client
```

### Deploy to Firebase Hosting

**Deploy hosting:**
```bash
bun firebase:deploy:hosting
# or
firebase deploy --only hosting
```

**Preview before deploying:**
```bash
firebase hosting:channel:deploy preview-branch-name
```

### Verify Hosting Deployment

```bash
# Open deployed site
firebase open hosting:site

# Or visit URL manually
# https://your-project.web.app
```

### Custom Domain Setup

If you have a custom domain (e.g., `fantasyautocoach.com`):

```bash
# Add custom domain
firebase hosting:sites:list
firebase hosting:channel:deploy production --site=your-custom-domain
```

**Configure in Firebase Console:**
1. Go to Hosting settings
2. Add custom domain
3. Follow DNS setup instructions
4. Wait for SSL certificate provisioning (5-15 minutes)

## 4️⃣ Firestore Rules & Indexes Deployment

### Deploy Security Rules

```bash
bun firebase:deploy:firestore
# or
firebase deploy --only firestore:rules
```

### Deploy Indexes

```bash
firebase deploy --only firestore:indexes
```

### Test Firestore Rules Locally

```bash
# Start emulators
bun dev:emulators

# Run tests against emulator
bun test:server
```

## 🔄 Complete Deployment Workflow

### Development Environment

```bash
# 1. Build everything
bun run build
bun run build:client

# 2. Deploy Cloud Run (via OpenTofu)
# Follow OpenTofu guide in infrastructure/opentofu/README.md

# 3. Deploy Firebase Functions
firebase use dev
bun firebase:deploy:functions

# 4. Deploy Client (with dev API URL)
export API_URL=$(cd infrastructure/opentofu && tofu output -raw api_url)
NG_APP_API_BASE_URL="$API_URL" bun run build:client
bun firebase:deploy:hosting

# 5. Deploy Firestore
bun firebase:deploy:firestore
```

### Production Environment

```bash
# 1. Run checks
bun run checks

# 2. Build everything
bun run build
bun run build:api
bun run build:client

# 3. Deploy Cloud Run with version tag
cd server/api && bun run build && cd ../../
bun run container:build
docker tag auto-coach-api us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:v1.0.0
docker push us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:v1.0.0

cd infrastructure/opentofu
tofu apply \
  -var-file="environments/prod.tfvars" \
  -var="container_image_tag=v1.0.0" \
  [... other vars ...]
cd ../../

# 4. Deploy Firebase Functions
firebase use prod
bun firebase:deploy:functions

# 5. Deploy Client (with prod API URL)
export API_URL=$(cd infrastructure/opentofu && tofu output -raw api_url)
NG_APP_API_BASE_URL="$API_URL" bun run build:client
bun firebase:deploy:hosting

# 6. Verify everything
curl $API_URL/health
firebase open hosting:site
```

## 🎯 CI/CD Automation (GitHub Actions)

### Automated Deployment Triggers

**On push to `main` branch:**
- ✅ Detects changed files
- ✅ Runs tests and builds
- ✅ Deploys Cloud Run API (if server code changed)
- ✅ Deploys Firebase Functions (if function code changed)
- ✅ Deploys Client (if client code changed)
- ✅ Deploys Firestore rules (if rules changed)

### Required GitHub Secrets

Set these in GitHub Settings → Secrets:

```
GOOGLE_CREDENTIALS              # GCP service account JSON
GCP_PROJECT_ID                  # Your GCP project ID
FIREBASE_PROJECT_ID             # Your Firebase project ID
FIREBASE_TOKEN                  # Firebase CI token (get with: firebase login:ci)
FIREBASE_SERVICE_ACCOUNT_*      # Firebase Hosting service account
SENDGRID_API_KEY               # SendGrid API key
YAHOO_APP_ID                   # Yahoo API app ID
YAHOO_CLIENT_ID                # Yahoo API client ID
YAHOO_CLIENT_SECRET            # Yahoo API client secret
```

### Get Firebase CI Token

```bash
firebase login:ci
# Opens browser, authenticate, copy token
# Add token to GitHub secrets as FIREBASE_TOKEN
```

### Manual Workflow Dispatch

Trigger deployments manually via GitHub Actions UI:
- Go to Actions tab
- Select workflow
- Click "Run workflow"
- Choose environment (dev/prod)

## 🔍 Verification Checklist

After deployment, verify:

### Cloud Run API
```bash
# Health check
curl https://your-cloud-run-url.run.app/health

# API endpoint test
curl -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  https://your-cloud-run-url.run.app/api/teams
```

### Firebase Functions
```bash
# List functions
firebase functions:list

# View recent logs
firebase functions:log --limit 50
```

### Firebase Hosting
```bash
# Open site
firebase open hosting:site

# Test API proxy (should hit Cloud Run)
curl https://your-site.web.app/api/health
```

### Firestore
```bash
# Test connection (if you have test data)
firebase firestore:get users/test-user-id
```

## 🐛 Troubleshooting

### "Firebase command not found"

```bash
npm install -g firebase-tools
firebase --version
```

### "Error: HTTP Error: 403, Permission Denied"

```bash
# Re-authenticate
firebase login --reauth

# Check project access
firebase projects:list
```

### "Error: Functions did not deploy properly"

```bash
# Check function build
bun run build

# Verify compiled files exist
ls server/functions/lib/

# Check function logs
firebase functions:log
```

### "Client build doesn't have API URL"

```bash
# Ensure API_URL is set before building
export API_URL="https://your-cloud-run-url.run.app"
NG_APP_API_BASE_URL="$API_URL" bun run build:client

# Verify in built files
grep -r "API_BASE_URL" client/dist/
```

### Firebase Hosting Not Updating

```bash
# Clear cache
firebase hosting:channel:deploy preview --force

# Check deployment history
firebase hosting:releases:list

# Rollback if needed
firebase hosting:rollback
```

## 📦 Package.json Scripts Reference

```bash
# Firebase deployments
bun firebase:deploy              # Deploy everything
bun firebase:deploy:hosting      # Deploy client only
bun firebase:deploy:functions    # Deploy functions only
bun firebase:deploy:firestore    # Deploy Firestore rules/indexes

# Firebase project management
bun firebase:login               # Authenticate
bun firebase:use:dev             # Switch to dev project
bun firebase:use:prod            # Switch to prod project

# Infrastructure (Cloud Run)
bun infra:init                   # Initialize OpenTofu
bun infra:plan:dev               # Plan dev changes
bun infra:apply:dev              # Deploy to dev
bun infra:output                 # Show Cloud Run URL

# Building
bun run build                    # Build all TypeScript
bun run build:client             # Build Angular client
bun run build:api                # Build Bun API binary

# Testing
bun run checks                   # Run all checks (tests, lint, build)
bun dev:emulators               # Start Firebase emulators
```

## 🔒 Security Considerations

### Secrets Management
- ✅ API keys stored in Google Secret Manager (via OpenTofu)
- ✅ Firebase Functions access secrets via Secret Manager
- ✅ Client never receives secrets (server-side only)
- ✅ Environment variables set per environment

### Access Control
- ✅ Cloud Run requires Firebase auth tokens
- ✅ Firestore rules enforce user permissions
- ✅ CORS configured per environment
- ✅ Functions require authentication

### Best Practices
- 🔐 Never commit secrets to Git
- 🔐 Use service accounts with minimal permissions
- 🔐 Rotate secrets regularly
- 🔐 Enable Cloud Audit Logs
- 🔐 Use separate projects for dev/prod

## 📊 Monitoring & Logs

### Cloud Run Logs
```bash
gcloud run services logs read auto-coach-api-prod \
  --region=us-central1 \
  --limit=100
```

### Firebase Function Logs
```bash
firebase functions:log --limit 100
```

### Firestore Usage
```bash
# View in Firebase Console
firebase open console
# Navigate to Firestore → Usage
```

### Error Alerting

Set up in Google Cloud Console:
1. Cloud Monitoring → Alerting
2. Create alert for 5xx errors
3. Add notification channel (email/Slack)

## 💰 Cost Optimization

### Development
- Cloud Run scales to zero ($0 when idle)
- Firebase Functions scale to zero
- Hosting: Free tier (10 GB bandwidth/month)
- Firestore: Free tier (50K reads/day)

**Estimated dev cost: $2-10/month**

### Production
- Monitor Cloud Run usage
- Optimize function cold starts
- Use Firestore wisely (batch operations)
- Enable caching where possible

**Estimated prod cost: $20-100/month** (depends on traffic)

## 🆘 Support

**Deployment issues?**
1. Check this guide's troubleshooting section
2. Review GitHub Actions logs (if using CI/CD)
3. Check Google Cloud Console for Cloud Run
4. Check Firebase Console for Functions/Hosting
5. Review application logs

**Quick diagnostics:**
```bash
# Cloud Run status
bun infra:status:prod

# Firebase status
firebase projects:list
firebase functions:list

# View all logs
bun run logs:all  # (if you add this script)
```

---

**Last Updated:** 2025-01-13  
**Architecture:** Cloud Run + Firebase Functions + Firebase Hosting
