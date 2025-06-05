# Auto Coach Infrastructure - OpenTofu

Infrastructure as Code for the Auto Coach API server using OpenTofu, optimized for Bun compiled binaries on Google Cloud Run.

## Prerequisites

- [OpenTofu](https://opentofu.org/docs/intro/install/) installed (>= 1.6.0)
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- [Docker](https://docs.docker.com/get-docker/) installed
- Google Cloud Project with billing enabled
- [Bun](https://bun.sh/) installed (for building the application)

## Initial Setup

### 1. Google Cloud Authentication

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable Required APIs

```bash
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com
```

### 3. Configure OpenTofu Variables

Create your variables file from the example:

```bash
# From infrastructure/opentofu directory
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your actual values:

```hcl
project_id          = "your-gcp-project-id"
firebase_project_id = "your-firebase-project-id"
region              = "us-central1"
environment         = "dev"
allowed_origins     = "http://localhost:4200,https://yourdomain.com"
```

### 4. Initialize OpenTofu

```bash
# From infrastructure/opentofu directory
tofu init
```

## Environment Configuration

### Development Environment

```bash
# Use development-specific configuration
tofu plan -var-file="environments/dev.tfvars" -var="project_id=YOUR_PROJECT_ID" -var="firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
```

### Production Environment

```bash
# Use production-specific configuration
tofu plan -var-file="environments/prod.tfvars" -var="project_id=YOUR_PROJECT_ID" -var="firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
```

## Deployment Workflows

### Development Deployment

```bash
# Preview changes (dry run)
tofu plan -var-file="environments/dev.tfvars" \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="firebase_project_id=YOUR_FIREBASE_PROJECT_ID"

# Apply changes
tofu apply -var-file="environments/dev.tfvars" \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
```

### Production Deployment

```bash
# Preview changes (dry run)
tofu plan -var-file="environments/prod.tfvars" \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="firebase_project_id=YOUR_FIREBASE_PROJECT_ID"

# Apply changes (requires confirmation)
tofu apply -var-file="environments/prod.tfvars" \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
```

### Container Build and Test

Before deploying, build and test the container locally:

```bash
# Build the API binary (linux target for container compatibility)
cd ../../server/api
bun run build

# Build Docker container (from workspace root)
cd ../../
bun run container:build

# Test container locally
bun run container:run
```

## Infrastructure Components

### Created Resources

- **Artifact Registry Repository**: Stores Docker images
- **Service Account**: For Cloud Run with Firebase permissions
- **Cloud Run Service**: Hosts the compiled Bun binary
- **IAM Policies**: Environment-specific access controls
- **Project Services**: Enables required Google Cloud APIs

### Environment-Specific Settings

| Environment | Min Instances | Max Instances | Memory | CPU | Public Access |
|-------------|---------------|---------------|---------|-----|---------------|
| Development | 0             | 10            | 512Mi   | 1   | Yes           |
| Production  | 0             | 100           | 512Mi   | 1   | Authenticated |

## Cold Start Optimizations

The infrastructure is optimized for fast cold starts:

- **Compiled Binary**: Bun builds to a single executable
- **Distroless Container**: Minimal base image (~10MB)
- **Gen 2 Execution Environment**: Latest Cloud Run performance
- **CPU Boost**: Enabled for faster initialization
- **No CPU Throttling**: Maintains performance during startup
- **Optimized Health Checks**: Fast startup and liveness probes

### Bun Build Production Flags

For best performance and smallest binaries, we use Bun's recommended production flags:

```bash
bun build --compile --minify --sourcemap --bytecode src/index.ts --target=bun-linux-x64 --outfile=dist/server
```

- `--minify`: Smaller binary, faster cold starts
- `--sourcemap`: Debuggability in production
- `--bytecode`: Faster startup (Bun can skip parsing JS/TS at runtime)
- `--target=bun-linux-x64`: Ensures compatibility with Linux containers

## State Management

### Local State (Default)

By default, OpenTofu stores state locally. For production use, consider using remote state:

### Google Cloud Storage Backend

1. Create a bucket for state storage:
```bash
gsutil mb gs://your-terraform-state-bucket
```

2. Uncomment the GCS backend configuration in `versions.tf`:
```hcl
backend "gcs" {
  bucket = "your-terraform-state-bucket"
  prefix = "auto-coach/infrastructure"
}
```

3. Re-initialize OpenTofu:
```bash
tofu init
```

## Monitoring and Management

### View Outputs

```bash
# Show all outputs
tofu output

# Show specific output
tofu output service_url
```

### View Resource State

```bash
# List all resources
tofu state list

# Show resource details
tofu state show google_cloud_run_v2_service.auto_coach_api
```

### Service Logs

```bash
# View service logs
gcloud run services logs read auto-coach-api-dev \
    --region=us-central1 \
    --project=YOUR_PROJECT_ID
```

### Check Service Status

```bash
gcloud run services describe auto-coach-api-dev \
    --region=us-central1 \
    --format="value(status.url,status.conditions)"
```

## Configuration Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `project_id` | Google Cloud Project ID | `my-project-123` |
| `firebase_project_id` | Firebase Project ID | `my-firebase-project` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `region` | `us-central1` | Google Cloud Region |
| `environment` | `dev` | Environment name (dev/prod) |
| `allowed_origins` | `http://localhost:4200` | CORS origins |
| `container_image_tag` | `latest` | Container image tag |
| `custom_domain` | `null` | Custom domain for service |

### Advanced Configuration

Override environment defaults with these variables:

- `min_instances_override`: Override minimum instances
- `max_instances_override`: Override maximum instances
- `memory_override`: Override memory allocation
- `cpu_override`: Override CPU allocation
- `timeout_override`: Override request timeout
- `enable_all_users_access`: Override access control
- `additional_env_vars`: Add custom environment variables
- `labels`: Add custom resource labels

## Troubleshooting

### Common Issues

#### 1. Permission Errors

```bash
# Ensure proper authentication
gcloud auth application-default login

# Check project permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

#### 2. API Not Enabled

```bash
# Enable required APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

#### 3. State Lock Issues

```bash
# Force unlock if needed (use carefully)
tofu force-unlock LOCK_ID
```

#### 4. Resource Import Issues

```bash
# List existing resources
gcloud run services list --project=YOUR_PROJECT_ID

# Check resource format for import
tofu import --help
```

### Debug Commands

```bash
# Validate configuration
tofu validate

# Format configuration files
tofu fmt

# Show execution plan
tofu plan -detailed-exitcode

# Show current state
tofu show

# Refresh state from actual infrastructure
tofu refresh
```

## Security Considerations

- Service runs as non-root user (UID 1001)
- Distroless container for minimal attack surface
- Environment-specific IAM policies
- Firebase authentication integration
- CORS properly configured per environment
- Service account follows principle of least privilege

## Cost Optimization

- **Development**: 0 minimum instances, scales to zero
- **Production**: 0 minimum instances with burst capacity
- **Container Images**: Optimized for minimal size
- **Resource Allocation**: Environment-specific sizing

## CI/CD Integration

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


## Support

For issues with this infrastructure setup:

1. Check the [troubleshooting section](#troubleshooting)
2. Review OpenTofu logs and plan output
3. Check Google Cloud Console for service status
4. Verify all configuration values are set correctly
