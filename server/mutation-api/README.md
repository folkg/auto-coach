# Mutation API

Internal service for handling Yahoo Fantasy lineup changes and transactions with robust rate limiting and queueing.

## Overview

The Mutation API replaces Firebase Functions for lineup setting, transactions, and positional scarcity calculations. It provides:

- **Rate-limited Yahoo API calls** via token bucket + circuit breaker
- **Cloud Tasks queuing** for reliable, scalable execution
- **Cloud Scheduler triggers** for scheduled operations
- **Effect-TS error handling** with typed failures and retries

### Architecture

```
┌─────────────────────┐
│  Cloud Scheduler    │
│  (Hourly/Daily)     │
└─────────┬───────────┘
          │ POST /mutations/set-lineup
          │ POST /mutations/weekly-transactions
          │ POST /mutations/calc-positional-scarcity
          ▼
┌─────────────────────┐
│   Mutation API      │
│   (Cloud Run)       │
├─────────────────────┤
│ Dispatch Routes     │──────► Firestore (tasks)
│ - Fan-out users     │──────► Cloud Tasks (enqueue)
└─────────┬───────────┘
          │
          │ POST /mutations/execute/mutation
          ▼
┌─────────────────────┐
│ Execution Routes    │
│ - Rate limiting     │──────► Yahoo Fantasy API
│ - Task execution    │──────► Firestore (status updates)
└─────────────────────┘
```

See [spec.md](../../spec.md) for the full design specification.

## Local Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- Firebase project with Firestore
- GCP project with Cloud Tasks enabled (for full local testing)

### Install Dependencies

```bash
# From workspace root
bun install
```

### Environment Variables

Copy the example environment file and configure:

```bash
cd server/mutation-api
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3001) |
| `NODE_ENV` | Environment (development/production) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `CLOUD_TASKS_QUEUE_PATH` | Full Cloud Tasks queue path |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

### Run Locally

```bash
# Development with hot reload
bun run dev

# Or from workspace root
bun run --cwd server/mutation-api dev
```

The server starts at `http://localhost:3001`.

### Run Tests

```bash
# Run all tests
bun test

# Watch mode
bun run test:watch
```

## API Endpoints

### Health Checks

#### `GET /`
Root health check.

**Response:**
```json
{ "status": "ok" }
```

#### `GET /health`
Kubernetes-style health probe (returns 200 with empty body).

#### `GET /mutations/`
Mutations subsystem health check.

**Response:**
```json
{ "status": "ok", "timestamp": "2025-01-15T10:30:00.000Z" }
```

### Dispatch Endpoints

These endpoints are called by Cloud Scheduler to fan-out work to Cloud Tasks.

#### `POST /mutations/set-lineup`

Triggers lineup processing for all users with active teams in leagues that have games starting soon.

**Request Body:**
```json
{
  "userId": "scheduler",
  "teamKey": "all",
  "lineupChanges": []
}
```

**Response (200):**
```json
{
  "success": true,
  "taskCount": 42,
  "message": "Successfully enqueued 42 set lineup tasks for leagues: nfl, nba"
}
```

**Behavior:**
1. Skips if current Pacific hour is 0 (midnight)
2. Determines leagues with games starting in the next hour
3. Fetches all active teams for those leagues
4. Sets postponed teams and starting players (parallel)
5. Enqueues mutation tasks for each user to Cloud Tasks

#### `POST /mutations/weekly-transactions`

Triggers weekly transaction processing for all users.

**Request Body:**
```json
{
  "userId": "scheduler",
  "teamKey": "all",
  "transactions": []
}
```

**Response (200):**
```json
{
  "success": true,
  "taskCount": 0,
  "message": "Weekly transactions scheduled successfully"
}
```

#### `POST /mutations/calc-positional-scarcity`

Recalculates positional scarcity offsets for all leagues.

**Request Body:**
```json
{
  "userId": "scheduler",
  "leagueKey": "all"
}
```

**Response (200):**
```json
{
  "success": true,
  "taskCount": 1,
  "message": "Positional scarcity calculation completed for league: all"
}
```

### Execution Endpoint

#### `POST /mutations/execute/mutation`

Executes a single mutation task. Called by Cloud Tasks.

**Request Body:**
```json
{
  "task": {
    "id": "task-uuid-123",
    "type": "SET_LINEUP",
    "userId": "user123",
    "payload": {
      "uid": "user123",
      "teams": [{ "team_key": "nfl.l.123.t.1", ... }]
    },
    "status": "PENDING",
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Task Types:**
- `SET_LINEUP` - Set optimal lineup for user's teams
- `WEEKLY_TRANSACTIONS` - Process weekly add/drop transactions
- `CALC_POSITIONAL_SCARCITY` - Recalculate scarcity offsets

**Response (200):**
```json
{
  "success": true,
  "taskId": "task-uuid-123",
  "status": "COMPLETED",
  "message": "Mutation completed successfully",
  "processedAt": "2025-01-15T10:00:05.000Z"
}
```

**Error Responses:**

Rate limited (429):
```json
{
  "error": "Mutation execution failed",
  "message": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

Domain error (400):
```json
{
  "error": "Mutation execution failed",
  "message": "Invalid payload: missing uid field",
  "code": "INVALID_PAYLOAD"
}
```

System error (500):
```json
{
  "error": "Mutation execution failed",
  "message": "Set lineup failed: Yahoo API timeout",
  "code": "SET_LINEUP_FAILED"
}
```

## Local Container Testing (Against Production)

> **Warning:** These commands execute REAL operations against production Yahoo Fantasy accounts. Use with caution.

### Build the Container

```bash
# From server/mutation-api directory
bun run container:build

# Or manually from workspace root
docker build -f server/mutation-api/Dockerfile -t auto-coach-mutation-api .
```

### Run with Production Credentials

1. **Get a service account key** with access to your production Firebase/GCP project:

```bash
# Download from GCP Console or create via CLI
gcloud iam service-accounts keys create ./sa-key.json \
  --iam-account=mutation-api-prod@your-project.iam.gserviceaccount.com
```

2. **Run the container:**

```bash
docker run --rm -it \
  -p 3001:3001 \
  -e PORT=3001 \
  -e NODE_ENV=production \
  -e FIREBASE_PROJECT_ID=auto-gm-372620 \
  -e CLOUD_TASKS_QUEUE_PATH=projects/auto-gm-372620/locations/us-central1/queues/mutation-queue-prod \
  -e ALLOWED_ORIGINS=http://localhost:3001 \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/sa-key.json \
  -v "$(pwd)/sa-key.json:/app/sa-key.json:ro" \
  auto-coach-mutation-api
```

3. **Verify the container is healthy:**

```bash
curl http://localhost:3001/
# {"status":"ok"}

curl http://localhost:3001/mutations/
# {"status":"ok","timestamp":"2025-01-15T..."}
```

### Trigger Production Operations

> **Warning:** These trigger REAL lineup changes and transactions!

```bash
# Trigger set-lineup dispatch (fans out to all active users)
curl -X POST http://localhost:3001/mutations/set-lineup \
  -H "Content-Type: application/json" \
  -d '{"userId":"manual-test","teamKey":"all","lineupChanges":[]}'

# Trigger weekly transactions
curl -X POST http://localhost:3001/mutations/weekly-transactions \
  -H "Content-Type: application/json" \
  -d '{"userId":"manual-test","teamKey":"all","transactions":[]}'

# Trigger positional scarcity recalculation
curl -X POST http://localhost:3001/mutations/calc-positional-scarcity \
  -H "Content-Type: application/json" \
  -d '{"userId":"manual-test","leagueKey":"all"}'
```

### Verify Operations Completed

1. **Check Firestore** for mutation task records:
   - Collection: `mutationTasks`
   - Look for recent documents with `status: "COMPLETED"`

2. **Check Cloud Tasks Console** for queued/completed tasks:
   - Navigate to Cloud Tasks in GCP Console
   - Select the `mutation-queue-prod` queue
   - View task execution history

3. **Check Cloud Logging:**

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mutation-api-prod" \
  --project=your-project \
  --limit=50 \
  --format="table(timestamp,textPayload)"
```

### Clean Up

```bash
# Remove the service account key
rm ./sa-key.json

# Remove the container
docker rm -f $(docker ps -aq --filter ancestor=auto-coach-mutation-api)
```

## Infrastructure Deployment (OpenTofu)

The Mutation API infrastructure is defined in `infrastructure/opentofu/mutation-api.tf`.

### Resources Created

- **Cloud Run Service** (`mutation-api-prod`)
- **Service Account** with Firestore, Cloud Tasks, and Firebase permissions
- **Cloud Tasks Queue** (`mutation-queue-prod`) with rate limiting
- **Cloud Scheduler Jobs:**
  - `set-lineup-schedule-prod` - Every hour at minute 0
  - `weekly-transactions-schedule-prod` - Daily at 2 AM ET
  - `calc-scarcity-schedule-prod` - Weekly on Sunday at 3 AM ET

### Prerequisites

1. GCP project with billing enabled
2. Firebase project (can be same as GCP)
3. Required APIs enabled (run from `infrastructure/opentofu`):

```bash
gcloud services enable \
  run.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com
```

4. OpenTofu state bucket exists:

```bash
gsutil mb -p $PROJECT_ID -l us-central1 gs://auto-coach-terraform-state
```

### Deploy Infrastructure

```bash
cd infrastructure/opentofu

# Initialize
tofu init

# Source environment variables
source ../../.env.deployment

# Plan changes
tofu plan \
  -var-file="environments/prod.tfvars" \
  -var="sendgrid_api_key=$SENDGRID_API_KEY" \
  -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET"

# Apply
tofu apply \
  -var-file="environments/prod.tfvars" \
  -var="sendgrid_api_key=$SENDGRID_API_KEY" \
  -var="yahoo_client_secret=$YAHOO_CLIENT_SECRET"
```

### Configuration

| Setting | Value |
|---------|-------|
| Max Cloud Run instances | 100 |
| Cloud Tasks max dispatches/sec | 10 |
| Cloud Tasks retry attempts | 5 |

See `infrastructure/opentofu/environments/prod.tfvars` for full configuration.

For detailed infrastructure documentation, see [infrastructure/opentofu/README.md](../../infrastructure/opentofu/README.md).

## CI/CD Pipeline

### Automatic Deployment

The GitHub Actions workflow (`.github/workflows/deploy-mutation-api.yml`) automatically deploys on:

- **Push to main** with changes to:
  - `server/mutation-api/**`
  - `common/**`
  - `infrastructure/opentofu/**`
  - `ops/**`

- **Manual dispatch** via GitHub Actions UI

### Pipeline Steps

1. **Detect Changes** - Determines if mutation-api or infrastructure changed
2. **Test & Build** - Runs linting, tests, and builds the binary
3. **Build & Push Container** - Builds Docker image and pushes to Artifact Registry
4. **Deploy Infrastructure** - Applies OpenTofu changes (main branch only)
5. **Deploy to Prod** - Updates Cloud Run service

### Manual Deployment

From the workspace root:

```bash
# Deploy to prod with version
bun run deploy mutation-api --env prod --version v1.2.3

# Dry run (no changes)
bun run deploy mutation-api --env prod --dry-run
```

Or use the package scripts:

```bash
cd server/mutation-api

# Deploy to prod
bun run deploy:prod
```

### Trigger Manual Workflow

Via GitHub CLI:

```bash
gh workflow run deploy-mutation-api.yml
```

## Monitoring & Troubleshooting

### Cloud Logging

View logs in GCP Console or via CLI:

```bash
# Recent logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mutation-api-prod" \
  --project=$PROJECT_ID \
  --limit=100

# Error logs only
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mutation-api-prod AND severity>=ERROR" \
  --project=$PROJECT_ID \
  --limit=50
```

### Key Metrics

Monitor in Cloud Console or set up alerts for:

- **Cloud Run:**
  - Request count and latency
  - Error rate (4xx, 5xx)
  - Instance count
  - Memory/CPU utilization

- **Cloud Tasks:**
  - Queue depth
  - Task execution latency
  - Retry count
  - Dead letter queue size

- **Custom (logged):**
  - Rate limit hits
  - Circuit breaker trips
  - Yahoo API 429/999 errors

### Common Issues

#### "Rate limit exceeded" errors
The token bucket is depleted. Check:
- Current rate limit settings in `rate-limiter.service.ts`
- Yahoo API rate limit headers in responses
- Consider reducing `maxTokens` or `refillRate`

#### Circuit breaker is open
Yahoo is returning 429/999 errors. The circuit breaker prevents further calls for 5 minutes.
- Check Yahoo API status
- Review logs for the triggering error
- Wait for circuit breaker to reset

#### Tasks stuck in PROCESSING
The worker may have crashed or timed out.
- Check Cloud Run logs for OOM or timeout errors
- Verify Cloud Tasks retry configuration
- Consider increasing Cloud Run memory/timeout

#### "REVOKED_REFRESH_TOKEN" errors
User's Yahoo OAuth token has been revoked. This is logged but not retried.
- User needs to re-authenticate via the client app
- Check `mutationTasks` collection for affected users

### Rate Limiting Behavior

The service uses a token bucket with circuit breaker:

| Setting | Value |
|---------|-------|
| Max tokens | 10 |
| Refill rate | 1 token/second |
| Window size | 60 seconds |
| Circuit breaker trip | On 429/999 error |
| Circuit breaker reset | 5 minutes |

## Cutover from Firebase Functions

### Pre-Cutover Checklist

1. [ ] Mutation API deployed and healthy in prod
2. [ ] Cloud Scheduler jobs verified (check execution history)
3. [ ] Rate limiting tested with production load
4. [ ] Monitoring/alerting configured
5. [ ] Rollback procedure documented

### Cutover Steps

1. **Disable Firebase Function Triggers**

   In Firebase Console or via CLI:
   ```bash
   # Pause scheduled functions
   firebase functions:delete scheduleSetLineup --region us-central1
   firebase functions:delete dispatchSetLineup --region us-central1
   firebase functions:delete scheduleWeeklyLeagueTransactions --region us-central1
   firebase functions:delete scheduleCalcPositionalScarcity --region us-central1
   ```

2. **Verify New Service is Receiving Traffic**

   Check Cloud Scheduler execution history:
   ```bash
   gcloud scheduler jobs describe set-lineup-schedule-prod \
     --location us-central1 \
     --project $PROJECT_ID
   ```

   Check Cloud Run request count:
   ```bash
   gcloud run services describe mutation-api-prod \
     --region us-central1 \
     --project $PROJECT_ID \
     --format="value(status.latestReadyRevisionName)"
   ```

3. **Monitor for 24-48 Hours**
   - Watch for error rate spikes
   - Verify lineup changes are being applied
   - Check user feedback/reports

### Rollback Procedure

If issues occur after cutover:

1. **Re-enable Firebase Functions**
   
   Redeploy the functions (if code still exists):
   ```bash
   firebase deploy --only functions:scheduleSetLineup,functions:dispatchSetLineup
   ```

   Or restore from a previous deployment via Firebase Console.

2. **Pause Cloud Scheduler Jobs**

   ```bash
   gcloud scheduler jobs pause set-lineup-schedule-prod --location us-central1
   gcloud scheduler jobs pause weekly-transactions-schedule-prod --location us-central1
   gcloud scheduler jobs pause calc-scarcity-schedule-prod --location us-central1
   ```

3. **Investigate and Fix**
   - Review Cloud Run logs for errors
   - Check Firestore for failed tasks
   - Fix issues and redeploy
   - Resume Cloud Scheduler jobs when ready

### Post-Cutover Cleanup

Once stable for 1+ week:

1. Delete Firebase Functions code (already done per "rip and replace" strategy)
2. Remove obsolete Firestore indexes
3. Archive old Cloud Functions logs
4. Update documentation to remove references to old system
