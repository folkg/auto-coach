# Auto Coach Infrastructure - OpenTofu

Complete step-by-step guide for deploying the Auto Coach Bun/Hono API to Google Cloud Run using OpenTofu (Terraform).

## 📋 What You're Deploying

This infrastructure creates:
- **Cloud Run Service**: Hosts your Bun API container
- **Artifact Registry**: Stores Docker images
- **Secret Manager**: Securely stores API keys (SendGrid, Yahoo)
- **Service Account**: Provides secure access to Firebase and secrets
- **IAM Policies**: Controls who can access your API

## 🎯 Prerequisites

Before starting, you need:

### Required Software

1. **OpenTofu** (>= 1.6.0) - Infrastructure as Code tool (like Terraform)
   ```bash
   # macOS
   brew install opentofu

   # Or download from https://opentofu.org/docs/intro/install/
   ```

2. **Google Cloud CLI** - Command-line tool for Google Cloud
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Or download from https://cloud.google.com/sdk/docs/install
   ```

3. **Docker** - For building container images
   ```bash
   # Download from https://docs.docker.com/get-docker/
   ```

4. **Bun** - JavaScript runtime (already required for this project)
   ```bash
   # macOS
   brew install oven-sh/bun/bun
   ```

### Required Accounts & Information

You'll need:
- ✅ Google Cloud Project with billing enabled
- ✅ Firebase Project (can be same as GCP project)
- ✅ SendGrid API key (from [SendGrid](https://app.sendgrid.com/settings/api_keys))
- ✅ Yahoo Developer credentials (from [Yahoo Developer Console](https://developer.yahoo.com/apps/))
  - Yahoo App ID
  - Yahoo Client ID
  - Yahoo Client Secret

## 🚀 Complete Deployment Guide

### Step 1: Google Cloud Authentication

**First time setup:**

```bash
# Login to Google Cloud
gcloud auth login

# Set up application default credentials (used by OpenTofu)
gcloud auth application-default login

# Set your project ID (replace with your actual project)
export PROJECT_ID="your-gcp-project-id"
export FIREBASE_PROJECT_ID="your-firebase-project-id"

gcloud config set project $PROJECT_ID
```

**Verify you're authenticated:**
```bash
gcloud config list
# Should show your project and account
```

### Step 2: Enable Required Google Cloud APIs

**These APIs must be enabled before OpenTofu can create resources:**

```bash
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    firebase.googleapis.com \
    firestore.googleapis.com
```

**Wait 1-2 minutes for APIs to fully enable.**

### Step 3: Create State Storage Bucket

OpenTofu needs a place to store its state file (tracks what's been created).

```bash
# Create bucket for state storage
gsutil mb -p $PROJECT_ID -l us-central1 gs://auto-coach-terraform-state

# Enable versioning (allows rollback if needed)
gsutil versioning set on gs://auto-coach-terraform-state
```

**Note:** The bucket name `auto-coach-terraform-state` is already configured in the code. If you want a different name, update `main.tf` line 15.

### Step 4: Set Up Secrets in Google Secret Manager

**You have two options:**

#### Option A: Using the Makefile (Recommended)

```bash
# Navigate to infrastructure directory
cd infrastructure/opentofu

# Create SendGrid secret
make set-sendgrid-secret ENVIRONMENT=dev PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
# (You'll be prompted to paste your SendGrid API key - it won't be visible while typing)

# Create Yahoo secret
make set-yahoo-secret ENVIRONMENT=dev PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
# (You'll be prompted to paste your Yahoo Client Secret)
```

#### Option B: Using gcloud directly

```bash
# Create SendGrid secret
echo "SG.your-sendgrid-api-key-here" | gcloud secrets create sendgrid-api-key-dev \
    --project=$PROJECT_ID \
    --data-file=-

# Create Yahoo secret
echo "your-yahoo-client-secret-here" | gcloud secrets create yahoo-client-secret-dev \
    --project=$PROJECT_ID \
    --data-file=-
```

**For Production:** Repeat these steps with `ENVIRONMENT=prod` or `-prod` suffix.

### Step 5: Initialize OpenTofu

```bash
# Navigate to infrastructure directory (if not already there)
cd infrastructure/opentofu

# Initialize OpenTofu (downloads providers and sets up backend)
tofu init
```

**Expected output:**
```
Initializing the backend...
Initializing provider plugins...
OpenTofu has been successfully initialized!
```

**If you get errors:**
- Make sure the state bucket exists (Step 3)
- Check your gcloud authentication (Step 1)

### Step 6: Build and Push Your API Container

**Before deploying infrastructure, you need a container image:**

```bash
# Navigate back to project root
cd ../../

# Build the API binary (optimized for Linux containers)
cd server/api
bun run build

# Navigate back to root
cd ../../

# Build Docker container for cloud
# It can be built locally with container:build, and then tested with container:run
bun run container:build:cloud

# Configure Docker to push to Google Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Tag the image for Artifact Registry
docker tag auto-coach-api us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:latest

# Push the image (this will fail the first time, that's expected!)
docker push us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:latest
```

**Expected error on first push:**
```
UNAUTHORIZED: failed to authorize: failed to fetch oauth token: ...
```

**This is normal!** The Artifact Registry repository doesn't exist yet. OpenTofu will create it in the next step.

### Step 7: Plan Infrastructure Changes (Dry Run)

**This shows you what OpenTofu will create WITHOUT actually creating it:**

```bash
# Navigate back to infrastructure directory
cd infrastructure/opentofu

# Set your credentials as environment variables (easier than typing each time)
export PROJECT_ID="your-gcp-project-id"
export FIREBASE_PROJECT_ID="your-firebase-project-id"
export YAHOO_APP_ID="your-yahoo-app-id"
export YAHOO_CLIENT_ID="your-yahoo-client-id"
export SENDGRID_API_KEY="SG.your-key-here"
export YAHOO_CLIENT_SECRET="your-secret-here"

# Run the plan
tofu plan \
  -var-file="environments/dev.tfvars" \
  -var="project_id=$PROJECT_ID" \
  -var="firebase_project_id=$FIREBASE_PROJECT_ID" \
  -var="yahoo_app_id=$YAHOO_APP_ID" \
  -var="yahoo_client_id=$YAHOO_CLIENT_ID" \
  -var="sendgrid_api_key=$SENDGRID_API_KEY" \
  -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET"
```

**Expected output:**
```
Plan: 16 to add, 0 to change, 0 to destroy.
```

**Review the plan carefully!** Make sure it's creating resources in the right project.

**Key resources to look for:**
- `google_artifact_registry_repository.auto_coach_repo` - Docker registry
- `google_cloud_run_v2_service.auto_coach_api` - Your API service
- `google_secret_manager_secret.sendgrid_api_key` - SendGrid secret
- `google_secret_manager_secret.yahoo_client_secret` - Yahoo secret
- `google_service_account.cloud_run_sa` - Service account

### Step 8: Apply Infrastructure (Actually Create It!)

**This creates the actual resources in Google Cloud:**

```bash
# Apply the changes
tofu apply \
  -var-file="environments/dev.tfvars" \
  -var="project_id=$PROJECT_ID" \
  -var="firebase_project_id=$FIREBASE_PROJECT_ID" \
  -var="yahoo_app_id=$YAHOO_APP_ID" \
  -var="yahoo_client_id=$YAHOO_CLIENT_ID" \
  -var="sendgrid_api_key=$SENDGRID_API_KEY" \
  -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET"
```

**You'll be prompted:**
```
Do you want to perform these actions?
  OpenTofu will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value:
```

**Type `yes` and press Enter.**

**This will take 2-5 minutes.** You'll see progress as each resource is created.

**Expected success output:**
```
Apply complete! Resources: 16 added, 0 changed, 0 destroyed.

Outputs:

api_url = "https://auto-coach-api-dev-xxxxx-uc.a.run.app"
container_registry_url = "us-central1-docker.pkg.dev/your-project/auto-coach"
...
```

**🎉 Save that `api_url`! You'll need it.**

### Step 9: Push Container Image (For Real This Time)

**Now that Artifact Registry exists, push your container:**

```bash
# Navigate back to project root
cd ../../

# Push the image
docker push us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:latest
```

**This should succeed now!** Takes 1-2 minutes depending on your upload speed.

### Step 10: Deploy Container to Cloud Run

**Update Cloud Run to use your pushed image:**

```bash
cd infrastructure/opentofu

# Apply again with container_image_tag=latest to trigger deployment
tofu apply \
  -var-file="environments/dev.tfvars" \
  -var="project_id=$PROJECT_ID" \
  -var="firebase_project_id=$FIREBASE_PROJECT_ID" \
  -var="yahoo_app_id=$YAHOO_APP_ID" \
  -var="yahoo_client_id=$YAHOO_CLIENT_ID" \
  -var="sendgrid_api_key=$SENDGRID_API_KEY" \
  -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET" \
  -var="container_image_tag=latest"
```

**Type `yes` to confirm.**

**This creates a new Cloud Run revision with your actual container.**

### Step 11: Verify Deployment

**Check if your API is live:**

```bash
# Get the API URL
API_URL=$(tofu output -raw api_url)
echo $API_URL

# Test the health endpoint
curl $API_URL/health

# Expected output: nothing (204 No Content) or {"status":"ok"}
```

**Or visit the URL in your browser:**
```bash
open $API_URL/health
```

**Check Cloud Run service status:**
```bash
gcloud run services describe auto-coach-api-dev \
    --region=us-central1 \
    --project=$PROJECT_ID \
    --format="value(status.url,status.conditions[0].type,status.conditions[0].status)"
```

**View logs:**
```bash
gcloud run services logs read auto-coach-api-dev \
    --region=us-central1 \
    --project=$PROJECT_ID \
    --limit=50
```

## 📝 Using the Makefile (Easier Way)

Once you understand the basics, the Makefile provides shortcuts:

```bash
cd infrastructure/opentofu

# Initialize
make init

# Plan changes
make plan ENVIRONMENT=dev PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID

# Apply changes
make apply ENVIRONMENT=dev PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID

# View outputs
make output

# Check status
make status ENVIRONMENT=dev PROJECT_ID=$PROJECT_ID

# View logs
make logs ENVIRONMENT=dev PROJECT_ID=$PROJECT_ID
```

**Or use the npm scripts from project root:**

```bash
# From project root
bun infra:init
bun infra:plan:dev      # Requires PROJECT_ID and FIREBASE_PROJECT_ID env vars
bun infra:apply:dev     # Requires all env vars
bun infra:output
bun infra:status:dev
```

## 🔄 Making Changes & Redeploying

**When you change your API code:**

1. Build new binary:
   ```bash
   cd server/api
   bun run build
   cd ../../
   ```

2. Build new container with a version tag:
   ```bash
   bun run container:build
   docker tag auto-coach-api us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:v1.0.1
   docker push us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:v1.0.1
   ```

3. Deploy with OpenTofu:
   ```bash
   cd infrastructure/opentofu
   tofu apply \
     -var-file="environments/dev.tfvars" \
     -var="project_id=$PROJECT_ID" \
     -var="firebase_project_id=$FIREBASE_PROJECT_ID" \
     -var="yahoo_app_id=$YAHOO_APP_ID" \
     -var="yahoo_client_id=$YAHOO_CLIENT_ID" \
     -var="sendgrid_api_key=$SENDGRID_API_KEY" \
     -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET" \
     -var="container_image_tag=v1.0.1"
   ```

**When you change infrastructure (Terraform files):**

```bash
cd infrastructure/opentofu
tofu plan -var-file="environments/dev.tfvars" ...  # Check changes
tofu apply -var-file="environments/dev.tfvars" ... # Apply changes
```

## 🌍 Deploying to Production

**Production uses different settings (stricter access, more scaling):**

1. **Create production secrets:**
   ```bash
   cd infrastructure/opentofu
   make set-sendgrid-secret ENVIRONMENT=prod PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
   make set-yahoo-secret ENVIRONMENT=prod PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
   ```

2. **Build and push production image:**
   ```bash
   cd ../../
   docker tag auto-coach-api us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:prod-v1.0.0
   docker push us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach/auto-coach-api:prod-v1.0.0
   ```

3. **Deploy production infrastructure:**
   ```bash
   cd infrastructure/opentofu
   tofu apply \
     -var-file="environments/prod.tfvars" \
     -var="project_id=$PROJECT_ID" \
     -var="firebase_project_id=$FIREBASE_PROJECT_ID" \
     -var="yahoo_app_id=$YAHOO_APP_ID" \
     -var="yahoo_client_id=$YAHOO_CLIENT_ID" \
     -var="sendgrid_api_key=$SENDGRID_API_KEY" \
     -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET" \
     -var="container_image_tag=prod-v1.0.0" \
     -var="allowed_origins=https://yourdomain.com,https://auto-gm-372620.web.app"
   ```

**Note:** Production requires authentication by default. For public access during initial testing, you can temporarily set in `prod.tfvars` or override during apply.

## 📊 Environment Differences

| Setting | Development | Production |
|---------|-------------|------------|
| **Min Instances** | 0 (scales to zero) | 0 (scales to zero) |
| **Max Instances** | 10 | 100 |
| **Public Access** | Yes (allUsers) | Yes (allUsers)* |
| **CORS Origins** | localhost:4200,3000 | Your production domain |
| **Service Name** | auto-coach-api-dev | auto-coach-api-prod |

*Note: Public access is currently enabled for both. Change `local.allow_unauthenticated` in `main.tf` if you want authenticated-only for prod.

## 🔍 Common Commands Reference

```bash
# View all infrastructure outputs
tofu output

# View specific output
tofu output -raw api_url

# List all managed resources
tofu state list

# View details of a specific resource
tofu state show google_cloud_run_v2_service.auto_coach_api

# Refresh state from actual infrastructure
tofu refresh -var-file="environments/dev.tfvars" ...

# Validate configuration files
tofu validate

# Format configuration files
tofu fmt

# Show current state
tofu show
```

## 🐛 Troubleshooting

### "Error: Error creating Service"

**Problem:** Cloud Run can't pull the container image.

**Solution:**
1. Verify image exists: `gcloud artifacts docker images list us-central1-docker.pkg.dev/$PROJECT_ID/auto-coach`
2. Check image tag matches `container_image_tag` variable
3. Ensure service account has `artifactregistry.reader` role

### "Error: googleapi: Error 403: Permission denied"

**Problem:** Your account doesn't have sufficient permissions.

**Solution:**
```bash
# Re-authenticate
gcloud auth application-default login

# Check you're using the right project
gcloud config get-value project

# Ensure you have Owner or Editor role
gcloud projects get-iam-policy $PROJECT_ID --flatten="bindings[].members" --filter="bindings.members:user:$(gcloud config get-value account)"
```

### "Error: Error acquiring the state lock"

**Problem:** State is locked (maybe from a previous failed run).

**Solution:**
```bash
# List locks
gsutil ls gs://auto-coach-terraform-state/**/*.tflock

# Force unlock (use the Lock ID from error message)
tofu force-unlock LOCK_ID
```

### Container Won't Start / Crashes

**Check logs:**
```bash
gcloud run services logs read auto-coach-api-dev \
    --region=us-central1 \
    --project=$PROJECT_ID \
    --limit=100
```

**Common issues:**
- Missing environment variables
- Binary built for wrong architecture (must be `bun-linux-x64`)
- Port mismatch (container must listen on port from `PORT` env var, default 3000)

### "Error: Resource not found" during destroy

**Problem:** Resource was deleted outside OpenTofu.

**Solution:**
```bash
# Remove from state without deleting the resource
tofu state rm google_cloud_run_v2_service.auto_coach_api

# Or import existing resource
tofu import google_cloud_run_v2_service.auto_coach_api projects/$PROJECT_ID/locations/us-central1/services/auto-coach-api-dev
```

## 🔒 Security Best Practices

✅ **Secrets are stored in Google Secret Manager** (never in code)
✅ **Container runs as non-root user** (UID 1001)
✅ **Distroless base image** (minimal attack surface)
✅ **Service account uses least privilege** (only Firebase viewer + secret accessor)
✅ **CORS properly configured** (only allowed origins can access API)
✅ **State stored in versioned GCS bucket** (can rollback if needed)

**Additional recommendations:**
- Use separate GCP projects for dev/prod
- Rotate secrets regularly
- Enable Cloud Audit Logs
- Set up Cloud Monitoring alerts
- Use VPC Service Controls for prod

## 💰 Cost Estimates

**Development:**
- Cloud Run: $0-5/month (scales to zero when not in use)
- Artifact Registry: <$1/month (minimal storage)
- Secret Manager: <$1/month (< 10 secrets)
- State Storage: <$0.10/month (< 1 GB)

**Total: ~$2-7/month** for development

**Production:** Depends on traffic, but with scale-to-zero: ~$10-50/month

## 🚨 Emergency Rollback

**If deployment breaks production:**

```bash
# List recent revisions
gcloud run revisions list --service=auto-coach-api-prod --region=us-central1

# Route traffic back to previous revision
gcloud run services update-traffic auto-coach-api-prod \
    --to-revisions=auto-coach-api-prod-00005-abc=100 \
    --region=us-central1
```

**Or rollback via OpenTofu:**
```bash
tofu apply \
  -var="container_image_tag=previous-working-tag" \
  ...
```

## 📚 Additional Resources

- [OpenTofu Documentation](https://opentofu.org/docs/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Bun Build Documentation](https://bun.sh/docs/bundler)
- [Firebase Documentation](https://firebase.google.com/docs)

## 🆘 Getting Help

**If you're stuck:**

1. Check this README's troubleshooting section
2. Review the Makefile: `cat Makefile` (shows all available commands)
3. Check OpenTofu logs: `tofu plan` output shows detailed errors
4. Check Google Cloud Console: https://console.cloud.google.com/run
5. Check state: `tofu state list` and `tofu show`

**For issues with this infrastructure:**
- Review the plan output carefully before applying
- Always test in dev environment first
- Keep secrets secure (never commit to Git)
- Use version control for infrastructure changes

---

**Infrastructure Status**: ✅ Production Ready
**Last Updated**: 2025-01-13
**Deployment**: Hybrid Cloud Run + Firebase
