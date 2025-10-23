# Lineup & Transactions Mutation Pipeline Refactor

## Overall Goal
Build a resilient, time‑bounded pipeline that separates computation (deriving lineup changes & transactions) from mutation (Yahoo API calls), minimizing failure amplification and coping with unknown global Yahoo rate limits inside a ~5 minute pre‑lock window.

## Constraints
- Global Yahoo limit tied to app client_id/client_secret (aggregate across users).
- Per-user tokens; all calls still contribute to shared limit.
- Run starts ~5 min before lineup lock; retries must fit (<~4 min budget).
- Uniform lock time assumption (no per-team prioritization complexity).
- Ordering: intradayTx → lineup(team) → nextDayTx (deprioritized). Partial lineup failures do NOT block nextDayTx.
- Domain known failures (waiver restriction etc.) are terminal (no retry).
- Average teams/user ≈3 (range 1–16). Many tasks may be no-ops.
- Want queue & persistence abstraction (avoid hard lock-in to Cloud Tasks / Firestore).

## Summary
Replace user-level batch task with granular MutationTask docs (intraday transaction, per-team lineup change, next-day transaction). Use Cloud Tasks (through TaskQueue abstraction) only to drive execution of individual mutation tasks stored in Firestore. Adaptive global concurrency uses a Firestore metrics doc (yahooRateMetrics) to throttle based on observed 429 / 999 ratio. Short bounded backoff (5s→10s→20s→40s) respecting deadline. Dependencies release next stage tasks automatically. Next-day transactions enqueued last.

## Core Types
Status: 'pending' | 'in_progress' | 'success' | 'failed' | 'timed_out'
Stage: 'intradayTx' | 'lineup' | 'nextDayTx'
Kind: 'transaction' | 'lineup'

MutationTask { id, uid, stage, kind, teamKey?, dependsOnStage?, payload, status, attempts, nextAttemptTs?, deadlineTs, idempotencyHash, lastError? }
YahooRateMetrics { windowStartTs, windowDurationMs, okCalls, err429Calls, inProgress, currentMaxParallel }

## 999 Error Handling Strategy
- Treat HTTP status 999 ("Request denied") equivalently to a rate limit (soft throttle) unless proven otherwise.
- Classification: map status 999 → ErrorType.RateLimit in error classifier.
- Metrics: count occurrences alongside 429 as err429Calls for adaptive concurrency.
- Backoff: use standard short ladder (5s,10s,20s) with ±25% jitter; do not extend beyond window.
- Concurrency reduction: if combined (429+999) ratio > 0.08 in current minute, halve currentMaxParallel (floor ≥2). If ratio > 0.15 force currentMaxParallel=2. Recover upward only after 2 consecutive windows ratio <0.02.
- Logging: structured log field errorCode=999 for quick filtering; include attempt, stage, uid, inProgressSnapshot.
- Final retry: if >3 consecutive 999 for same task and remaining window <30s, skip further retries and mark timed_out to free capacity.
- Validation: run controlled low-concurrency test (maxParallel=2) to confirm 999 frequency drops; if not, investigate alt causes (auth, payload).
- Separate domain non-retry XML checks before classifying 999 (waiver restriction stays DomainNonRetryable).

## Itemized Steps
1. Interfaces: TaskQueue, MutationTaskRepo, RateLimiter; types for MutationTask, PipelineOutput.
2. Split putLineupChanges into putSingleLineupChange(change, uid).
3. Pipeline builder: extract compute from setUsersLineup() returning { intradayTx?, lineupChanges[], nextDayTx? }.
4. Task creation: write MutationTask docs (id=idempotencyHash); enqueue intradayTx immediately.
5. Dependency release: after intradayTx success enqueue lineup tasks; after all lineup tasks terminal enqueue nextDayTx.
6. Adaptive limiter: implement Firestore transaction on yahooRateMetrics doc (update ok/err429, inProgress, adjust currentMaxParallel).
7. Mutator function: load task, check dependency, acquire slot, execute single Yahoo call, classify error, retry or mark terminal.
8. Retry policy: 5s→10s→20s→40s; abort if next retry exceeds deadline.
9. Deadline enforcement: global deadlineTs=runStart+4min; mark overdue pending as timed_out.
10. NextDayTx: enqueue only after lineup terminal (or if no lineup tasks). Low priority.
11. Periodic sweeper (safety): mark overdue tasks, trigger missed releases.
12. Logging: structured logs per mutation; optional aggregator summarizes 429 ratio & success %.
13. TDD tests: pipeline builder, rate limiter, backoff, dependency release, error classification, idempotency hash stability, deadline/timed_out behavior.
14. Incremental rollout: shadow writes → intradayTx cutover → lineup cutover → nextDayTx cutover → remove legacy posting → optimize.
15. Cleanup: TTL delete old MutationTask docs; monitor high 429 ratio or large timed_out counts.

## Backoff Table
Attempt1 fail → 5s
Attempt2 fail → 10s
Attempt3 fail → 20s
Attempt4+ or retry past deadline → timed_out

## Release Criteria
- Legacy batch Yahoo calls removed.
- ≥95% lineup tasks terminal before lock across sample runs.
- Adaptive limiter stabilizes (err429 ratio <0.05 sustained).
- NextDayTx deferred until lineup stage completion.

## Firebase Functions → HTTP API Migration Scope
- Objective: Remove dependency on Firebase Functions for lineup & transaction scheduling/execution (retain authBlockingFunctions). Provide Hono HTTP endpoints consumed by Cloud Scheduler and Cloud Tasks.
- Functions to migrate: dispatchsetlineup, dispatchweeklyleaguetransactions, addmocktaskstoqueue, mockdispatchsetlineup, schedulesetlineup, scheduleweeklyleaguetransactions, schedulecalcpositionalscarcity.
- New endpoint namespace: /api/internal/* (secured, non-user). Auth TBD (service account OIDC or shared secret header). Must NOT rely on firebaseAuthMiddleware (end-user JWT) for scheduler/task calls.

### Migration Considerations
- Ordering with pipeline refactor: introduce endpoints early (shadow) before switching scheduling & queue targets.
- Idempotency: Endpoints must be safe on duplicate invocations (return 200 with metadata, no duplicate enqueue side-effects beyond dedup logic).
- Security: Implement minimal middleware verifying shared secret or validating GCP OIDC token (preferred). Keep secret in env var INTERNAL_API_SECRET.
- Cloud Scheduler: Replace scheduleSetLineup & weekly transactions triggers with HTTP targets hitting /api/internal/schedule/set-lineup and /api/internal/schedule/weekly-transactions.
- Cloud Tasks: Replace function targets for mutation execution (future mutateExecuteTask) with /api/internal/mutation/execute (body contains taskId).
- Mock endpoints retained under /api/internal/mock/* for load testing.
- Logging parity: Structured logs same fields as old functions.
- IAM / Opentofu: Add google_cloud_run_service (if not already), google_cloud_scheduler_job resources, google_cloud_tasks_queue (HTTP target), service account w/ run.invoker.
- Removal: After successful cutover & observation window (≥7 days), delete lineupFunctions.ts & transactionFunctions.ts exports except auth blocking.

### Migration Tasks (Ordered)
M1. Define internal route prefix & auth middleware (secret or OIDC) in server/api/src/index.ts.
M2. Create endpoint handlers mapping existing function logic:
    - POST /api/internal/schedule/set-lineup → schedulesetlineup
    - POST /api/internal/schedule/weekly-transactions → scheduleweeklyleaguetransactions
    - POST /api/internal/schedule/calc-positional-scarcity → schedulecalcpositionalscarcity
    - POST /api/internal/dispatch/set-lineup → (will evolve: current dispatchsetlineup or new task creation logic)
    - POST /api/internal/dispatch/weekly-transactions → dispatchweeklyleaguetransactions
    - POST /api/internal/mutation/execute → mutateExecuteTask (pipeline)
    - POST /api/internal/mock/add-tasks → addmocktaskstoqueue
    - POST /api/internal/mock/dispatch-set-lineup → mockdispatchsetlineup
M3. Abstract shared function logic into reusable service modules (avoid Firebase-specific imports).
M4. Introduce queue abstraction usage in new dispatch endpoints (TaskQueue.enqueue).
M5. Implement HTTP response contracts (JSON: { status, details }).
M6. Add idempotency guard (e.g., schedule run keyed by date+hour) to prevent duplicate scheduleSetLineup processing.
M7. Update Opentofu:
    - Add resources for Cloud Scheduler jobs pointing to new HTTP endpoints.
    - Add Cloud Tasks queue with HTTP target (include OIDC token config or header).
    - Output service URL variables.
M8. Deploy shadow endpoints (Scheduler still hits old functions) → health verification.
M9. Switch Cloud Scheduler jobs to new endpoints; monitor logs & metrics.
M10. Switch Cloud Tasks queue target to /api/internal/mutation/execute.
M11. Remove Firebase Function usage for lineup/transaction dispatch (keep authBlockingFunctions); delete unused exports.
M12. Documentation update: architecture diagrams & operational runbook.
M13. Remove legacy retry config references; ensure pipeline handles retries.
M14. Post-cutover audit: confirm no unintended Firebase billing spikes; remove stale env vars.

### Integration With Existing Pipeline Steps
- Execute M1–M4 before pipeline Phase 0 (shadow tasks) so new endpoints can write MutationTask docs.
- Pipeline Phases map:
  * Phase 0 (shadow tasks) can call /api/internal/dispatch/* endpoints.
  * Phase 1 (intraday cutover) ensures /api/internal/mutation/execute is live.
  * Phases 2–4 proceed after M9 & M10 done.
- Final removal (M11) only after Phase 4 stable.

### Additional Testing
- Endpoint tests (vitest) co-located: index.internal.test.ts verifying auth rejection/acceptance, idempotency.
- Load test script for mutation execute endpoint (mock tasks) verifying adaptive limiter responses under concurrency.

### Internal Auth Recommendation
Security + IAC simplicity: use GCP OIDC (Cloud Scheduler & Cloud Tasks with service account identity invoking Cloud Run / internal API). Validate `Authorization: Bearer <jwt>` audience claim matches deployed service URL. Provide fallback shared secret header ONLY for local dev.
- Implementation: create dedicated service account `internal-scheduler-sa`; grant `roles/run.invoker` & Cloud Tasks enqueue.
- Cloud Scheduler job config: set OIDC token (service account email + audience).
- Cloud Tasks queue: set HTTP target with OIDC token (same audience).
- Internal middleware: verify OIDC token (preferred) OR if absent & `NODE_ENV=development` allow `x-internal-secret` header.
- Shared global rate metrics remain (no per-endpoint split).

### Integrated Ordering (Pipeline + Migration)
Order of execution aligning pipeline phases (P) and migration tasks (M):
1. P1/M1: Define interfaces (queue, repo, rate limiter) + internal route prefix & auth middleware.
2. P1/M2: Create internal endpoint handlers (schedule + dispatch + mock + positional scarcity).
3. P1/M3: Extract compute-only pipeline builder from setUsersLineup.
4. P1/M4: Implement MutationTask factories, idempotency hashing, Firestore repo skeleton.
5. P1 Step (shadow): Write tasks (intraday/lineup/nextDay) but keep legacy Yahoo calls.
6. M4: Integrate queue abstraction into internal dispatch endpoints.
7. P2/M5: Implement mutator endpoint /api/internal/mutation/execute using rate limiter & backoff.
8. M6: Add idempotency guard for schedule endpoints (date+hour key) & structured logging.
9. M7: Opentofu: provision OIDC-enabled Cloud Scheduler jobs & Cloud Tasks queue.
10. P2 Activation: Start shadow runs hitting internal endpoints (scheduler still old). Verify metrics.
11. M8/M9: Switch Cloud Scheduler to new schedule endpoints (disable old functions triggers except authBlockingFunctions).
12. P3: Cutover intradayTx to tasks; stop direct intraday posting.
13. P4: Cutover lineup tasks (use putSingleLineupChange); release logic enabled.
14. M10: Switch Cloud Tasks queue target to mutation execute endpoint.
15. P5: Cutover nextDayTx to tasks; remove legacy next-day posting.
16. M11: Remove Firebase function exports (except authBlockingFunctions) & decommission lineup/transaction functions.
17. P6/M12: Add periodic sweeper job via scheduler for overdue tasks & missed releases.
18. M13: Clean up legacy retry configs; ensure pipeline only handles retry logic.
19. M14: Documentation & operational runbook; TTL cleanup job for old MutationTasks.

## Future Enhancements
- Sharded rate metrics for high contention.
- Tier-based user prioritization.
- Dashboard analytics.
