# Auto Coach Infrastructure

Complete Infrastructure as Code for the Auto Coach application using OpenTofu/Terraform with Google Cloud Platform and Firebase.

## 🏗️ Architecture Overview

Auto Coach uses a **hybrid cloud architecture** combining Google Cloud Platform and Firebase services:

### **Cloud Infrastructure**
- **Google Cloud Run**: Containerized API server (Bun compiled binary)
- **Google Artifact Registry**: Container image storage
- **Google Secret Manager**: Secure API key storage
- **Google Cloud Storage**: OpenTofu state management

### **Firebase Services**
- **Firebase Hosting**: Angular frontend deployment
- **Firebase Functions**: Serverless backend functions (lineup, transactions, email, auth)
- **Firebase Firestore**: NoSQL database
- **Firebase Authentication**: User authentication

### **External Integrations**
- **SendGrid**: Email delivery service
- **Yahoo Fantasy Sports API**: Fantasy sports data

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

Run the interactive setup script for a complete guided deployment:

```bash
cd infrastructure/opentofu
./setup.sh
```

This script will:
- ✅ Check prerequisites
- ✅ Set up Google Cloud authentication
- ✅ Enable required APIs
- ✅ Create state bucket
- ✅ Configure secrets
- ✅ Deploy infrastructure
- ✅ Provide next steps

### Option 2: Manual Setup

Follow the detailed manual setup instructions below.

## 📋 Prerequisites

### Required Tools

1. **[OpenTofu](https://opentofu.org/docs/intro/install/)** (>= 1.6.0)
```bash
# macOS
brew install opentofu

# Or download from https://opentofu.org/docs/intro/install/
```

2. **[Google Cloud CLI](https://cloud.google.com/sdk/docs/install)**
```bash
# macOS
brew install google-cloud-sdk

# Or download from https://cloud.google.com/sdk/docs/install
```

3. **[Docker](https://docs.docker.com/get-docker/)** (for container builds)

4. **[Bun](https://bun.sh/)** (for building the API)

5. **[jq](https://stedolan.github.io/jq/)** (for JSON processing)
```bash
brew install jq
```

### Required Accounts & Credentials

1. **Google Cloud Project** with billing enabled
2. **Firebase Project** (can be the same as GCP project)
3. **SendGrid Account** - Get API key from [SendGrid](https://app.sendgrid.com/settings/api_keys)
4. **Yahoo Developer Account** - Get credentials from [Yahoo Developer Console](https://developer.yahoo.com/apps/)

## 🔧 Manual Setup Instructions

### 1. Google Cloud Authentication

```bash
# Authenticate with Google Cloud
gcloud auth login
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable Required APIs

```bash
cd infrastructure/opentofu
make setup-gcloud PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project
```

### 3. Set Up State Storage

```bash
make setup-state-bucket PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project
```

### 4. Configure Secrets

```bash
# Set up all secrets interactively
make setup-secrets ENVIRONMENT=dev PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project

# Or set individual secrets
make set-sendgrid-secret ENVIRONMENT=dev PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project
make set-yahoo-secret ENVIRONMENT=dev PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project
```

### 5. Create Configuration

```bash
# Copy example configuration
make create-tfvars

# Edit with your values
nano terraform.tfvars
```

Required configuration in `terraform.tfvars`:
```hcl
# Required variables
project_id          = "your-gcp-project-id"
firebase_project_id = "your-firebase-project-id"
yahoo_app_id        = "your-yahoo-app-id"
yahoo_client_id     = "your-yahoo-client-id"

# Environment-specific variables
environment         = "dev"
region              = "us-central1"
allowed_origins     = "http://localhost:4200"
yahoo_redirect_uri  = "http://localhost:4200/auth/callback"
```

### 6. Deploy Infrastructure

```bash
# Initialize OpenTofu
make init

# Plan deployment
make plan ENVIRONMENT=dev PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project

# Apply changes
make apply ENVIRONMENT=dev PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project
```

## 🏃‍♂️ Complete Workflows

### Development Workflow

```bash
cd infrastructure/opentofu

# Complete development setup and deployment
make dev-workflow PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase

# Or step by step:
make setup-gcloud PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
make setup-state-bucket PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
make init
make plan ENVIRONMENT=dev PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
make apply ENVIRONMENT=dev PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
```

### Production Workflow

```bash
cd infrastructure/opentofu

# Complete production setup and deployment
make prod-workflow PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase

# Or step by step with explicit confirmation
make plan ENVIRONMENT=prod PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
make apply ENVIRONMENT=prod PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
```

### First-Time Setup

```bash
# Complete first-time setup (includes secrets)
make first-time-setup ENVIRONMENT=dev PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
```

## 📁 Directory Structure

```
infrastructure/
├── README.md                      # This file
└── opentofu/                     # OpenTofu configuration
    ├── main.tf                   # Main infrastructure resources
    ├── variables.tf              # Variable definitions
    ├── outputs.tf                # Output definitions
    ├── versions.tf               # Provider versions
    ├── terraform.tfvars.example  # Example configuration
    ├── .gitignore               # Git ignore rules
    ├── Makefile                 # Convenience commands
    ├── setup.sh                 # Interactive setup script
    ├── README.md                # Detailed OpenTofu docs
    └── environments/            # Environment-specific configs
        ├── dev.tfvars          # Development configuration
        └── prod.tfvars         # Production configuration
```

## 🔒 Security & Secret Management

### Secret Manager Integration

Sensitive credentials are stored in Google Secret Manager:

- **SendGrid API Key**: `sendgrid-api-key-{environment}`
- **Yahoo Client Secret**: `yahoo-client-secret-{environment}`

Non-sensitive configuration is passed as environment variables:
- CORS origins
- Firebase project ID
- Yahoo App ID and Client ID

### Security Features

- ✅ **Non-root container execution** (UID 1001)
- ✅ **Distroless container images** (minimal attack surface)
- ✅ **Environment-specific IAM policies**
- ✅ **Encrypted secret storage**
- ✅ **CORS properly configured**
- ✅ **Principle of least privilege**

## 🌍 Environment Configuration

### Development Environment

| Setting | Value |
|---------|-------|
| **Min Instances** | 0 |
| **Max Instances** | 10 |
| **Memory** | 512Mi |
| **CPU** | 1 |
| **Public Access** | Yes (allUsers) |
| **CORS Origins** | `localhost:4200,localhost:3000` |

### Production Environment

| Setting | Value |
|---------|-------|
| **Min Instances** | 0 |
| **Max Instances** | 100 |
| **Memory** | 512Mi |
| **CPU** | 1 |
| **Public Access** | Authenticated only |
| **CORS Origins** | `auto-gm-372620.web.app` |

## 🐳 Container Deployment

### Build and Deploy Container

```bash
# From repository root
cd ../../

# Build the API binary (optimized for Cloud Run)
cd server/api
bun run build

# Build container image
cd ../../
bun run container:build

# Tag and push to Artifact Registry
SERVICE_URL=$(cd infrastructure/opentofu && tofu output -raw container_registry_url)
docker tag auto-coach-api $SERVICE_URL/auto-coach-api:latest
docker push $SERVICE_URL/auto-coach-api:latest

# The Cloud Run service will automatically deploy the new image
```

### Container Optimizations

- **Compiled Binary**: Bun builds to a single executable
- **Distroless Base**: Minimal container size (~10MB)
- **Linux Target**: Optimized for Cloud Run environment
- **Fast Cold Starts**: Optimized health checks and startup

## 📊 Monitoring & Management

### View Service Status

```bash
cd infrastructure/opentofu

# Check service status
make status ENVIRONMENT=dev PROJECT_ID=your-project

# View recent logs
make logs ENVIRONMENT=dev PROJECT_ID=your-project

# Follow logs in real-time
make logs-follow ENVIRONMENT=dev PROJECT_ID=your-project

# View infrastructure outputs
make output
```

### Key Outputs

```bash
# Get service URL
make output-url

# View all outputs
tofu output
```

## 🔍 Common Commands

```bash
cd infrastructure/opentofu

# Show help
make help

# Check configuration
make check

# Validate configuration
make validate

# Format configuration files
make fmt

# Show current state
tofu state list

# Refresh state from actual infrastructure
make refresh ENVIRONMENT=dev PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase

# Clean temporary files
make clean
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Authentication Problems
```bash
# Re-authenticate
gcloud auth login
gcloud auth application-default login
```

#### 2. API Not Enabled
```bash
# Enable required APIs
make setup-gcloud PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
```

#### 3. State Lock Issues
```bash
# List locks (if any)
tofu force-unlock LOCK_ID
```

#### 4. Permission Errors
```bash
# Check current project
gcloud config get-value project

# Verify authentication
gcloud auth list
```

#### 5. Container Build Issues
```bash
# Verify Docker is running
docker --version

# Check available space
docker system df

# Clean up if needed
docker system prune
```

### Debug Commands

```bash
# Validate configuration
tofu validate

# Check configuration syntax
tofu fmt -check

# Show planned changes
tofu plan

# Show current state
tofu show

# Import existing resources (if needed)
make import PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
```

## 💰 Cost Optimization

### Development Environment
- **Scales to zero** when not in use
- **Pay-per-request** pricing
- **Minimal resource allocation**
- **No persistent instances**

### Production Environment
- **Auto-scaling** based on traffic
- **Efficient resource utilization**
- **Optimized container images**
- **Cost monitoring via Google Cloud Console**

### Cost Estimates
- **Development**: $0-5/month (scales to zero)
- **Production**: $10-50/month (depends on traffic)
- **State Storage**: <$1/month
- **Secret Manager**: <$1/month

## 🔄 CI/CD Integration

### Automated GitHub Actions Workflows

This repository uses modern, monorepo-aware GitHub Actions for infrastructure and application deployment. The workflows are located in `.github/workflows/` at the repo root.

#### Infrastructure Deployment

- **Path-based triggers:** Any change to `infrastructure/**` triggers a plan and (on `main`) an apply.
- **OpenTofu:** Uses `opentofu/setup-opentofu` for IaC.
- **Google Cloud Auth:** Uses `google-github-actions/auth` for secure credentials.
- **Plan and Apply:** Plans are always run; applies only on `main` or via manual dispatch.
- **Deployment Records:** Each deployment is committed to the repo for traceability.

#### Example: Infrastructure Workflow

See `.github/workflows/infrastructure.yml` for the full workflow.

Key steps:
- Validate and plan changes with OpenTofu
- Apply changes to GCP on merge to `main`
- Commit deployment logs to `docs/deployments/`
- Notify PRs of plan/apply status

#### Application Deployment

- **Change Detection:** Only deploys API/Functions or Client if their code or shared code changes.
- **API & Functions:** Built and deployed together (Cloud Run + Firebase Functions).
- **Client:** Built and deployed to Firebase Hosting.
- **Preview Deployments:** PRs get client previews on Firebase Hosting.
- **Conventional Commits:** All deployments and logs follow conventional commit standards.

#### Manual Deployment

You can trigger infrastructure deployments manually via the GitHub Actions UI using the workflow_dispatch event in the infrastructure workflow.

#### Best Practices

- Always check the Actions tab for deployment status.
- Use PRs for all changes; merges to `main` are automatically deployed.
- For emergency fixes, use a hotfix branch and PR.


## 🔄 State Management

### Remote State (Google Cloud Storage)

State is automatically stored in Google Cloud Storage for:
- ✅ **Team collaboration**
- ✅ **State locking**
- ✅ **Backup and versioning**
- ✅ **CI/CD integration**

State bucket: `auto-coach-terraform-state`

### State Commands

```bash
# List resources in state
make state-list

# Show detailed state for a resource
make state-show

# Refresh state from actual infrastructure
make refresh ENVIRONMENT=dev PROJECT_ID=your-project FIREBASE_PROJECT_ID=your-firebase
```

## 🚀 Migration & Future Plans

### Current Hybrid Architecture
- **Cloud Run**: API container
- **Firebase Functions**: Serverless functions
- **Firebase Hosting**: Frontend hosting

### Future Migration Path
As mentioned, you plan to migrate Firebase Functions into the API container. The current infrastructure supports this transition:

1. **Phase 1** (Current): Hybrid Cloud Run + Firebase Functions
2. **Phase 2** (Future): Consolidated Cloud Run + Firebase Hosting
3. **Phase 3** (Optional): Full Google Cloud (Cloud Run + Cloud CDN)

The OpenTofu configuration is designed to evolve with these changes.

## 📚 Additional Resources

- **[OpenTofu Documentation](https://opentofu.org/docs/)**
- **[Google Cloud Run Documentation](https://cloud.google.com/run/docs)**
- **[Firebase Documentation](https://firebase.google.com/docs)**
- **[Google Cloud SDK](https://cloud.google.com/sdk/docs)**

## 🆘 Support

For detailed OpenTofu-specific documentation:
- See [infrastructure/opentofu/README.md](opentofu/README.md)

For issues or questions:
1. Check the troubleshooting section above
2. Review the OpenTofu plan output
3. Check Google Cloud Console for service status
4. Review application logs with `make logs`

---

**Infrastructure Status**: ✅ Production Ready
**Last Updated**: Auto-generated configuration
**Deployment**: Hybrid Cloud Run + Firebase