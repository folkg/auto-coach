# Mutation API Service Spec

## 1. Overview
Build a brand new, internal-only service `server/mutation-api` using **Hono**, **Effect-TS**, **Bun**, and **Cloud Tasks**. This service replaces the existing Firebase Functions for lineup setting and transactions.

The driving factor for this change is that Yahoo is imposing strict rate limits on the mutation calls to the server to put lineup changes and transactions. The exact rate limits are unknown, but this entire driver for this refactor is to provide sufficient throttlign and efficiency as to stay within operating limits, and to be able to tweak and customize the pace. Fetching and querying rate limits are more forgiving, but we also must be mindful not to be too greedy on the queries as well. The solution shall be resilient so that no teams are missed in the chance of errors. Refactoring the service with a stronger architecture with better error handling is also a strong, secondary driver.

**Strategy**: "Rip and Replace". We will implement the new API and **simultaneously delete** the obsolete code from `server/functions` and `server/core`. The currently deployed Firebase Functions will continue to run until the user manually turns them off, allowing us to keep the codebase clean immediately.

**Strict Requirement**: All implementation must be **fully migrated** with real calls to all external services (Yahoo, Firestore, Cloud Tasks). **No placeholders**, mocks (outside of tests), or "TODOs" for core logic are acceptable.

## 2. Architecture

### 2.1 Service Boundaries
- **Location**: `server/mutation-api` (New Package)
- **Type**: Internal HTTP API (Google Cloud Run / App Engine)
- **Auth**: Internal Service Account / OIDC (No user-facing auth)
- **Database**: Firestore (Persisting `MutationTask`s and RateLimit state)
- **Queue**: Cloud Tasks (Triggering execution)

### 2.2 Core Pipeline
1.  **Trigger**: Cloud Scheduler hits `POST /dispatch/set-lineup` (and others)
2.  **Fan-out (Compute)**:
    -   Stream all users from Firestore.
    -   For each user:
        -   Fetch current Yahoo Roster & Settings (Read-Only).
        -   **Compute** all necessary actions in-memory (`IntradayTx`, `Lineup`, `NextDayTx`).
        -   Create `MutationTask` records.
        -   Save `MutationTask`s to Firestore (Batch).
        -   Enqueue `MutationTask` IDs to Cloud Tasks (targeting `/execute/mutation`).
3.  **Execution (Mutation)**:
    -   Cloud Tasks hits `POST /execute/mutation` with Task ID.
    -   Worker reads `MutationTask`.
    -   **Global Rate Limit Check** (Firestore-backed).
    -   **Execute**: Performs the Yahoo API write.
    -   **Update**: Marks Task as `Success`/`Failed`.

## 3. Implementation Plan

All implementation shall follow test driven development (TDD) with tests written as a part of each phase. Unit tests shall use Effect's dependency injection patterns. A few integration tests shall be added using MSW to mock the network calls to ensure the entire stack is properly tested.

Functionality should be imported and re-used from the server/core/src/common folder wherever possible, not duplicated. The functionality from the specialized folders in server/core/src is what we are migrating to the new API. If code outside of the common is used ONLY by the new mutation-api, then it can be moved into the mutation-api package. If code is used by both the "api" and "mutation-api" then it shall stay. This must be carefully analyzed as a part of constructing the full implementation plan.

### Phase 1: Project Scaffolding & Config
- [ ] **Initialize Package**: Create `server/mutation-api` with `package.json` and basic directory structure.
- [ ] **Tooling Setup**: Configure `vitest` (testing), `msw` (testing), `biome` (linting/formatting), and `tsc` (build).
- [ ] **Dependencies**: Install `hono`, `effect`, `firebase-admin`, `@google-cloud/tasks`, and `@effect/*` libraries.
- [ ] **Data Models**: Define `MutationTask` schema and Zod/Schema types in `src/types`.
- [ ] **Entrypoint**: Create `src/index.ts` with Hono app skeleton and basic health check.

### Phase 2: The "Compute" Engine (Port & Refactor)
- [ ] **Yahoo Read Service**: Port `fetchRostersFromYahoo` to a pure Effect service.
- [ ] **Logic Migration**: Rewrite `LineupOptimizer` and Transaction logic as pure Effect functions (Inputs -> Actions).
- [ ] **Fan-out Endpoints**:
    -   `POST /dispatch/set-lineup` (Replacing `dispatchSetLineup` & `scheduleSetLineup`).
    -   `POST /dispatch/weekly-transactions` (Replacing `dispatchWeeklyLeagueTransactions` & `scheduleWeeklyLeagueTransactions`).
    -   `POST /dispatch/calc-positional-scarcity` (Replacing `scheduleCalcPositionalScarcity`).
    -   **Note**: `addMockTasksToQueue` and `mockDispatchSetLineup` are DELETED (not migrated).
    -   Use Effect `Stream` for bounded concurrency processing of users.
    -   Real Firestore batch writes for tasks.
    -   Real Cloud Tasks client for enqueuing.

### Phase 3: The "Execute" Engine (Port & Refactor)
- [ ] **Yahoo Write Service**: Port `putLineupChanges` and `postTransactions` to pure Effect services.
- [ ] **Scarcity Calculation Service**: Port `recalculateScarcityOffsetsForAll` logic to pure Effect service.
- [ ] **Rate Limit Service**: Implement Firestore-backed `GlobalRateLimiter` (Token Bucket + Circuit Breaker).
- [ ] **Worker Endpoint**: Implement `POST /execute/mutation`:
    -   Full flow: Read Task -> Rate Limit -> Execute Yahoo Call -> Update Firestore Status.
    -   Handle 429/999 errors by tripping the Circuit Breaker.

### Phase 4: Immediate Cleanup (The "Rip")
- [ ] **Delete** `server/functions/lineupFunctions.ts`.
- [ ] **Delete** `server/functions/transactionFunctions.ts`.
- [ ] **Delete** obsolete services in `server/core`:
    -   `dispatchSetLineup/*`
    -   `scheduleSetLineup/*`
    -   `scheduleCalcPositionalScarcity/*`
    -   `mockScheduleDispatch/*`
- [ ] **Retain** only `server/functions/authBlockingFunctions.ts` and shared types/utils in `server/core` needed by Auth or Client.

### Phase 5: Infrastructure & CI/CD
- [ ] **OpenTofu/Terraform**:
    -   Define `google_cloud_run_service` for `mutation-api`.
    -   Define `google_cloud_scheduler_job`s for new endpoints:
        -   `set-lineup`: `0 * * * *` (or whatever previous schedule was) -> `/dispatch/set-lineup`
        -   `weekly-transactions`: `0 0 * * *` -> `/dispatch/weekly-transactions`
        -   `calc-positional-scarcity`: `30 0 * * 0` -> `/dispatch/calc-positional-scarcity`
    -   Define `google_cloud_tasks_queue`.
- [ ] **GitHub Actions**:
    -   Create/Update `.github/workflows/deploy-mutation-api.yml`.
    -   This should be backed by new scripts in `ops/`
    -   Steps: Lint -> Test -> Build -> Docker Push -> Tofu Apply (or Cloud Run Deploy).
- [ ] **Build Scripts**: Ensure `bun build` works correctly for the new service. Add a new package.json script to deploy and dry deploy. Ensure the dry deploy works.

## 4. Rate Limiting & Error Handling
-   **Global Circuit Breaker**: If *any* worker hits a Yahoo 999/429, set a global "Pause" flag in Firestore for 5 minutes. All subsequent tasks fail fast (rescheduled by Cloud Tasks).
-   **Domain Errors**: Known issues (waivers, roster locked) are marked as Terminal Failure (no retry).
-   **System Errors**: Network blips are retried automatically by Cloud Tasks.
-   Effect errors shall be defined following this pattern: `class HttpError extends Data.TaggedError("HttpError")<{}> {}`
