# Mutation API Implementation Todo

## Overview

This document provides a detailed high-level implementation plan for replacing Firebase Functions with a new Hono-based Mutation API service using Effect-TS, Bun, and Cloud Tasks.

## Phase 1: Project Scaffolding & Configuration

### 1.1 Create New Package Structure

- **Create**: `server/mutation-api/` directory with complete package structure
- **Files to create**:
  - `package.json` - New package dependencies including `effect`, `@effect/platform`, `@google-cloud/tasks`. Dependencies shall be installed properly using bun install.
  - `tsconfig.json` - TypeScript configuration extending base config
  - `vitest.config.ts` - Test configuration
  - `biome.json` - Linting/formatting configuration (inherit existing)
  - `Dockerfile` - Container configuration (copy from server/api)
  - `.env.example` - Environment variables template

### 1.2 Dependencies & Tooling

- **Install**: `hono`, `effect`, `@effect/platform`, `@effect/schema`, `firebase-admin`, `@google-cloud/tasks`
- **Install dev deps**: `vitest`, `msw`, `@vitest/ui`
- **Configure**: Build scripts for Bun compilation

### 1.3 Core Data Models

- **Create**: `src/types/mutation-task.ts` - MutationTask schema using Effect Schema
- **Create**: `src/types/rate-limit.ts` - Rate limiting state schemas
- **Create**: `src/types/errors.ts` - Effect error types following pattern `class HttpError extends Data.TaggedError("HttpError")<{}> {}`

### 1.4 Basic Application Structure

- **Create**: `src/index.ts` - Hono app with health check endpoint
- **Create**: `src/routes/` directory structure for route organization
- **Create**: `src/services/` directory for Effect services
- **Create**: `src/test/` directory for test utilities

## Dependency Analysis: Core vs Mutation-API Services

### Services That MUST Stay in server/core (Shared with Standard API)

**1. User Teams Management** (`server/core/src/fetchUsersTeams/`)

- **Used by**: `server/api/src/teams/teams.ts` (GET /api/teams, GET /api/teams/partial)
- **Functions**: `getUserTeams()`, `getUserTeamsPartial()`, `updateTeamLineupSetting()`, `updateTeamLineupPaused()`
- **Action**: **KEEP IN CORE** - Standard API depends on these for team management

**2. Transaction Suggestions** (`server/core/src/transactions/`)

- **Used by**: `server/api/src/transactions/transactions.ts` (GET /api/transactions, POST /api/transactions)
- **Functions**: `getTransactionSuggestions()`, `processSelectedTransactions()`
- **Dependencies**: Uses `LineupOptimizer`, `positionalScarcity.service`, Yahoo API services
- **Action**: **KEEP IN CORE** - Client needs transaction suggestions and manual processing

**3. Schedule Data** (`server/core/src/scheduleSetLineup/`)

- **Used by**: `server/api/src/schedules/schedules.ts` (GET /api/schedules)
- **Functions**: `getSchedule()`, `getTodaysGames()`
- **Action**: **KEEP IN CORE** - Client needs schedule data

**4. Feedback System** (`server/core/src/common/services/email/`)

- **Used by**: `server/api/src/feedback/feedback.ts` (POST /api/feedback)
- **Functions**: `sendUserFeedbackEmail()`, `sendFeedbackEmail()`
- **Action**: **KEEP IN CORE** - Client feedback functionality

**5. All Yahoo API Services** (`server/core/src/common/services/yahooAPI/`)

- **Used by**: Both Standard API and Mutation API
- **Functions**: `getUsersTeams()`, `putLineupChanges()`, `postRosterAddDropTransaction()`, etc.
- **Action**: **KEEP IN CORE** - Shared read/write operations

**6. All Firestore Services** (`server/core/src/common/services/firebase/`)

- **Used by**: Both Standard API and Mutation API
- **Functions**: `fetchTeamsFirestore()`, `updateFirestoreTimestamp()`, etc.
- **Action**: **KEEP IN CORE** - Shared database operations

**7. All Common Utilities** (`server/core/src/common/`)

- **Used by**: Both APIs and client
- **Functions**: Error handling, utilities, constants, etc.
- **Action**: **KEEP IN CORE** - Shared infrastructure

### Services That Shall Be Migrated to server/mutation-api

**1. Lineup Optimization Logic** (`server/core/src/dispatchSetLineup/`)

- **Used by**: Only Firebase Functions (being replaced)
- **Functions**: `LineupOptimizer`, `PlayerTransactions`, `Team`, `PlayerCollection` classes
- **Action**: **MIGRATE TO MUTATION-API** - Move the files - do not rewrite in Effect. The new Effects will use these classes as-is.

**2. Positional Scarcity Calculation** (`server/core/src/calcPositionalScarcity/`)

- **Used by**: Only Firebase Functions and transaction suggestions (staying in core)
- **Functions**: `recalculateScarcityOffsetsForAll()`, `calculateOffsetForPosition()`
- **Action**: **SPLIT MIGRATION**:
  - Keep calculation logic in core for transaction suggestions
  - Migrate scheduled recalculation to mutation-api

**3. Mock Services** (`server/core/src/mockScheduleDispatch/`)

- **Used by**: Only development/testing
- **Functions**: `addMockTasksToQueue()`, `mockDispatchSetLineup()`
- **Action**: **DELETE** - Not needed in new architecture

## Phase 2: Core Services Migration (Effect-TS Port)

### 2.1 Business Logic Services (Migration from server/core/src/dispatchSetLineup/)

- **Port**: `server/core/src/dispatchSetLineup/classes/LineupOptimizer.ts` → `server/mutation-api/src/services/LineupOptimizer.ts`
- **Port**: `server/core/src/dispatchSetLineup/classes/PlayerTransactions.ts` → `server/mutation-api/src/services/PlayerTransactions.ts`
- **Port**: `server/core/src/dispatchSetLineup/classes/Team.ts` → `server/mutation-api/src/services/Team.ts`
- **Port**: `server/core/src/dispatchSetLineup/classes/PlayerCollection.ts` → `server/mutation-api/src/services/PlayerCollection.ts`
- **Move**: Class-based logic will be copied as-is. New Effects will make use of these classes and wrap them as needed.
- **Reference**: Keep using Yahoo API and Firestore services from core via imports

### 2.2 Positional Scarcity Service (Split Migration)

- **Keep**: `server/core/src/calcPositionalScarcity/services/positionalScarcity.service.ts` (for transaction suggestions)
- **Port**: Scheduled calculation logic → `server/mutation-api/src/services/positional-scarcity.service.ts` (Effect version)
- **Create**: Wrapper in mutation-api that calls core calculation logic
- **Optimize**: Batch processing for better performance in scheduled execution

### 2.3 Mutation Task Management

- **Create**: `server/mutation-api/src/services/mutation-task.service.ts` - Task creation and management
- **Create**: `server/mutation-api/src/services/user-processor.service.ts` - User streaming and processing
- **Dependencies**: Import and use core services (Yahoo API, Firestore, etc.)
- **Pattern**: Effect services that orchestrate core functionality

## Phase 3: API Endpoints Implementation

### 3.1 Dispatch Endpoints (Compute Engine)

- **Create**: `POST /dispatch/set-lineup` - Replaces `dispatchSetLineup` and `scheduleSetLineup`
  - Input: Validation for dispatch trigger
  - Process: Stream all users → Compute actions → Create MutationTasks → Enqueue to Cloud Tasks
  - Use: Effect `Stream` for bounded concurrency
- **Create**: `POST /dispatch/weekly-transactions` - Replaces `dispatchWeeklyLeagueTransactions`
  - Similar pattern to set-lineup but for weekly transaction processing
- **Create**: `POST /dispatch/calc-positional-scarcity` - Replaces `scheduleCalcPositionalScarcity`
  - Process: Calculate scarcity offsets → Update Firestore

### 3.2 Execution Endpoint (Mutation Engine)

- **Create**: `POST /execute/mutation` - Core worker endpoint
  - Input: Task ID from Cloud Tasks
  - Process: Read MutationTask → Rate Limit Check → Execute Yahoo Call → Update Status
  - Error handling: Circuit breaker for 429/999 errors

### 3.3 Rate Limiting Service

- **Create**: `server/mutation-api/src/services/rate-limiter.service.ts`
  - Token bucket algorithm implementation
  - Firestore-backed state persistence
  - Circuit breaker pattern for Yahoo API errors
  - Global pause flag for emergency throttling

### 3.4 Cloud Tasks Integration

- **Create**: `server/mutation-api/src/services/cloud-tasks.service.ts`
  - Task creation and enqueueing
  - Proper error handling and retry configuration
  - Task routing to execution endpoint

## Phase 4: Infrastructure & Deployment

### 4.1 OpenTofu Infrastructure

- **Modify**: `infrastructure/opentofu/main.tf`
  - Add: `google_cloud_run_service.mutation_api`
  - Add: `google_cloud_tasks_queue.mutation_queue`
  - Add: `google_cloud_scheduler_job` resources:
    - `set-lineup-schedule` → `/dispatch/set-lineup` (hourly)
    - `weekly-transactions-schedule` → `/dispatch/weekly-transactions` (daily)
    - `calc-scarcity-schedule` → `/dispatch/calc-positional-scarcity` (weekly)
- **Create**: `infrastructure/opentofu/mutation-api.tf` - Separate file for mutation API resources

### 4.2 CI/CD Pipeline

- **Create**: `.github/workflows/deploy-mutation-api.yml`
  - Steps: Lint → Test → Build → Docker Push → Tofu Apply
- **Modify**: `.github/workflows/ci.yml`
  - Add: `mutation-api` to change detection
  - Add: New job for mutation-api deployment
- **Create**: `ops/tools/mutation-api.ts` - Deployment scripts

### 4.3 Build & Deployment Scripts

- **Modify**: `ops/deploy.ts`
  - Add: `mutation-api` component option
  - Add: Build and deploy logic for new service
- **Create**: `server/mutation-api/package.json` scripts
  - `build`, `test`, `deploy`, `deploy:dry`

## Phase 5: Code Cleanup (The "Rip")

### 5.1 Files to Delete Completely

- **Delete**: `server/functions/lineupFunctions.ts`
- **Delete**: `server/functions/transactionFunctions.ts`
- **Delete**: `server/core/src/dispatchSetLineup/` (entire directory - migrated to mutation-api)
- **Delete**: `server/core/src/mockScheduleDispatch/` (entire directory - not needed)
- **Delete**: `server/core/src/scheduleSetLineup/` (KEEP - used by standard API for schedules)

### 5.2 Files to Keep in Core (Shared Services)

- **Keep**: `server/core/src/fetchUsersTeams/` - Used by standard API teams endpoint
- **Keep**: `server/core/src/transactions/` - Used by standard API transactions endpoint
- **Keep**: `server/core/src/calcPositionalScarcity/` - Used by transaction suggestions
- **Keep**: `server/core/src/common/` - All shared utilities and types
- **Keep**: `server/core/src/authBlockingFunctions/` - Firebase Auth functionality

### 5.3 Package Dependencies Cleanup

- **Modify**: `server/core/package.json` - Remove dependencies only used by deleted services
- **Modify**: `server/functions/package.json` - Update after deletions
- **Update**: Import statements in mutation-api to reference core services

## Integrated TDD Approach (Throughout All Phases)

### Testing Strategy Integration

**Phase 1 TDD:**

- **Create**: `server/mutation-api/src/test/setup.ts` - Test utilities and MSW setup
- **Create**: `server/mutation-api/src/test/mocks/` - Mock implementations for external services
- **Write failing tests first** for basic application structure and health check
- **Pattern**: Arrange-Act-Assert with setup functions returning disposable objects

**Phase 2 TDD (Service Migration):**

- **For each service port**: Write failing tests first, then implement
- **Yahoo Read Service**: `server/mutation-api/src/services/yahoo/read.service.test.ts` - Test API calls, error handling, response parsing
- **Yahoo Write Service**: `server/mutation-api/src/services/yahoo/write.service.test.ts` - Test mutation calls, rate limit responses, error classification
- **Firestore Service**: `server/mutation-api/src/services/firestore.service.test.ts` - Test CRUD operations, batch writes, transaction handling
- **Business Logic Services**: Tests for each service with edge cases and error scenarios
- **Mock**: Use Effect's dependency injection patterns for service mocking

**Phase 3 TDD (API Endpoints):**

- **Dispatch Endpoints**: `server/mutation-api/src/routes/dispatch.test.ts` - Test request validation, user streaming, task creation
- **Execution Endpoint**: `server/mutation-api/src/routes/execute.test.ts` - Test task processing, rate limiting, error handling
- **Rate Limiter**: `server/mutation-api/src/services/rate-limiter.service.test.ts` - Test token bucket, circuit breaker, Firestore persistence
- **Integration Tests**: `server/mutation-api/src/test/integration/` - MSW-based end-to-end tests

**Phase 4 TDD (Infrastructure):**

- **Deployment Tests**: Validate Cloud Run configuration and health checks
- **Infrastructure Tests**: Ensure Cloud Tasks and Scheduler resources are properly configured

**Phase 5 TDD (Cleanup):**

- **Regression Tests**: Ensure no functionality is lost during cleanup
- **Shared Code Tests**: Verify that shared dependencies still work correctly

### Continuous Testing Requirements

**Unit Tests (Every Service):**

- Test both success and error cases
- Use Effect's testing utilities for Effect-based services
- Mock external dependencies using Effect's dependency injection
- Follow AAA pattern with setup functions returning disposable objects

**Integration Tests (Critical Flows):**

- MSW-based mocking of Yahoo API responses
- Test complete dispatch → execution pipeline
- Validate Firestore state changes
- Test Cloud Tasks creation and processing
- Test rate limiting and circuit breaker behavior

**Error Handling Tests:**

- Circuit breaker activation and recovery
- Rate limiting enforcement
- Domain vs system error classification
- Retry logic and exponential backoff
- Network failure scenarios

**Performance Tests:**

- Concurrent user processing limits
- Rate limiting under load
- Memory usage during large batch operations
- Cloud Tasks queue processing performance

## Phase 6: Migration & Cutover

### 6.1 Parallel Deployment

- **Deploy**: New mutation-api service alongside existing Firebase Functions
- **Validate**: Both systems work independently
- **Monitor**: Performance and error rates

### 6.2 Gradual Cutover

- **Disable**: Firebase Functions one by one after validation
- **Monitor**: System behavior during cutover
- **Rollback**: Plan to re-enable Functions if issues arise

### 6.3 Final Cleanup

- **Remove**: Firebase Functions from Firebase project
- **Update**: Documentation and monitoring
- **Archive**: Old code if needed for reference

## Critical Dependencies & Considerations

### Shared Code Analysis Required

1. **`server/core/src/common/`** - Determine what's truly shared vs mutation-specific
2. **`server/core/src/fetchUsersTeams/`** - Check if used by client API
3. **`common/` package** - Ensure all needed types are available
4. **Environment variables** - Map Firebase Functions config to new service

### Rate Limiting Strategy

1. **Token Bucket**: Implement per-minute and per-hour limits
2. **Circuit Breaker**: 5-minute pause on 429/999 errors
3. **Backpressure**: Use Effect Stream concurrency control
4. **Monitoring**: Firestore-based metrics and alerting

### Error Classification

1. **Domain Errors**: Waivers, roster locked (terminal failure)
2. **System Errors**: Network blips (retry with Cloud Tasks)
3. **Rate Limit Errors**: Trigger circuit breaker
4. **Unknown Errors**: Log and retry with exponential backoff

### Data Migration

1. **No Schema Changes**: Maintain existing Firestore collections
2. **Backward Compatibility**: Ensure existing client API continues working
3. **State Management**: Preserve rate limiting state across deployments

## Success Criteria

1. **100% Feature Parity** with existing Firebase Functions. There shall be no placeholder code or TODOs for later. This must be turn-key for deployment when you are done.
2. **Improved Rate Limit Handling** with configurable throttling
3. **Better Error Recovery** with circuit breaker and retry logic
4. **Clean Codebase** with obsolete code removed
5. **Comprehensive Test Coverage** for all new services
6. **Smooth Deployment** with zero downtime during cutover
