# Auto Coach Infrastructure

Infrastructure as Code for the Auto Coach API server using Pulumi TypeScript, optimized for Bun compiled binaries on Google Cloud Run.

## Prerequisites

- [Bun](https://bun.sh/) installed
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/) installed
- [Docker](https://docs.docker.com/get-docker/) installed
- Google Cloud Project with billing enabled

## Initial Setup

### 1. Install Dependencies

From the project root:

```bash
bun install
```

### 2. Google Cloud Authentication

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 3. Enable Required APIs

```bash
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com
```

### 4. Initialize Pulumi Stack

```bash
# From project root - initialize development stack
bun run infrastructure:init:dev

# Or initialize production stack
bun run infrastructure:init:prod

# Or manually
cd infrastructure/pulumi
pulumi stack init dev
```

### 5. Configure Pulumi

Set required configuration values:

```bash
# From infrastructure/pulumi directory
pulumi config set gcp:project YOUR_PROJECT_ID
pulumi config set gcp:region us-central1
pulumi config set auto-coach:environment dev
pulumi config set auto-coach:allowedOrigins "http://localhost:4200,https://yourdomain.com"
pulumi config set auto-coach:firebaseProjectId YOUR_FIREBASE_PROJECT_ID
```

Or use the convenience script:

```bash
# From project root
bun run infrastructure:config gcp:project YOUR_PROJECT_ID
bun run infrastructure:config auto-coach:firebaseProjectId YOUR_FIREBASE_PROJECT_ID
```

## Environment Configuration

### Development

```bash
pulumi stack select dev
pulumi config set auto-coach:environment dev
pulumi config set auto-coach:allowedOrigins "http://localhost:4200"
```



### Production

```bash
pulumi stack init prod
pulumi stack select prod
pulumi config set auto-coach:environment prod
pulumi config set auto-coach:allowedOrigins "https://yourdomain.com"
```

## Deployment Workflows

### Development Deployment

```bash
# Preview changes (dry run)
bun run deploy:dry

# Deploy to development
bun run deploy:dev
```

### Production Deployment

```bash
# Deploy to production (requires confirmation)
bun run deploy:prod
```

### Container Build and Test

Before deploying, build and test the container locally:

```bash
# Build the API binary (linux target for container compatibility)
bun run build:api

# Build Docker container (from workspace root)
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

### Cloud Run Min Instances

Both development and production environments are configured with `minInstances: 0` for cost savings. This means your API will scale to zero when idle, and you only pay for what you use.

## Monitoring and Logs

### View Service Logs

```bash
# From infrastructure/pulumi directory
pulumi logs --follow
```

### Check Service Status

```bash
gcloud run services describe auto-coach-api-dev \
    --region=us-central1 \
    --format="value(status.url,status.conditions)"
```

## Configuration Reference

### Required Configuration

| Key | Description | Example |
|-----|-------------|---------|
| `gcp:project` | Google Cloud Project ID | `my-project-123` |
| `auto-coach:firebaseProjectId` | Firebase Project ID | `my-firebase-project` |

### Optional Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `gcp:region` | `us-central1` | Google Cloud Region |
| `auto-coach:environment` | `dev` | Environment name |
| `auto-coach:allowedOrigins` | `http://localhost:4200` | CORS origins |

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

#### 3. Container Build Failures

```bash
# Test local build
cd server/api
bun run build
bun run container:build
```

#### 4. Pulumi State Issues

```bash
# Refresh state
pulumi refresh

# Import existing resources if needed
pulumi import gcp:cloudrun/service:Service auto-coach-api projects/PROJECT/locations/REGION/services/SERVICE
```

### Debug Commands

```bash
# Check Pulumi configuration
pulumi config

# View current stack info
pulumi stack

# Preview without applying
pulumi preview --diff

# View resource details
pulumi stack output --json
```

## Security Considerations

- Service runs as non-root user (UID 1001)
- Distroless container for minimal attack surface
- Environment-specific IAM policies
- Firebase authentication integration
- CORS properly configured per environment

## Cost Optimization

- **Development**: 0 minimum instances, scales to zero
- **Production**: 1 minimum instance for availability, aggressive scaling

## CI/CD Integration

Add to your GitHub Actions or similar:

```yaml
- name: Deploy to Development
  run: |
    pulumi stack select dev
    pulumi up --yes
  working-directory: infrastructure/pulumi
  env:
    PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
    GOOGLE_CREDENTIALS: ${{ secrets.GOOGLE_CREDENTIALS }}
```

## Support

For issues with this infrastructure setup:

1. Check the [troubleshooting section](#troubleshooting)
2. Review Pulumi logs: `pulumi logs`
3. Check Google Cloud Console for service status
4. Verify all configuration values are set correctly