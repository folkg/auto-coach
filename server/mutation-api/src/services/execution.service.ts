import type { FirestoreTeam } from "@common/types/team.js";
import type { Firestore } from "@google-cloud/firestore";

import { isApiRateLimitError, isAuthorizationError } from "@common/utilities/error.js";
import { Context, Effect, Layer, Schema } from "effect";

import type { MutationTask } from "../types/schemas.js";
import type { RateLimiterService } from "./rate-limiter.service.js";

import { RevokedRefreshTokenError } from "../../../core/src/common/services/firebase/errors.js";
import { handleYahooAuthRevoked } from "../../../core/src/common/services/firebase/handleYahooAuthRevoked.service.js";
import { isYahooMaintenanceError } from "../../../core/src/common/services/yahooAPI/yahooHttp.service.js";
import {
  RateLimitError as EffectRateLimitError,
  DomainError,
  type ExecuteMutationRequest,
  type ExecuteMutationResponse,
  type MutationError,
  ServiceUnavailableError,
  SystemError,
  type TaskStatusUpdate,
} from "../types/api-schemas.js";
import { SetLineupPayloadSchema, WeeklyTransactionsPayloadSchema } from "../types/schemas.js";
import { recalculateScarcityOffsetsForAll } from "./positional-scarcity.service.js";
import { setUsersLineup } from "./set-lineup.service.js";
import { performWeeklyLeagueTransactions } from "./weekly-transactions.service.js";

export interface ExecutionService {
  executeMutation(
    request: ExecuteMutationRequest,
  ): Effect.Effect<ExecuteMutationResponse, MutationError>;
  updateTaskStatus(update: TaskStatusUpdate): Effect.Effect<void, never>;
}

export class ExecutionServiceImpl implements ExecutionService {
  constructor(
    private readonly firestore: Firestore,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  executeMutation(
    request: ExecuteMutationRequest,
  ): Effect.Effect<ExecuteMutationResponse, MutationError> {
    const { task } = request;
    const self = this;

    return Effect.gen(function* () {
      yield* Effect.logInfo("Starting mutation execution");

      // Update task status to PROCESSING
      yield* self.updateTaskStatus({
        taskId: task.id,
        status: "PROCESSING",
        message: "Starting mutation execution",
      });

      // Check rate limits - retryAfter is propagated via HTTP Retry-After header from the route
      yield* self.rateLimiter.checkRateLimit(task.userId).pipe(
        Effect.tapError((error) =>
          Effect.annotateLogs(Effect.logWarning("Rate limit exceeded"), {
            retryAfter: error.retryAfter ?? "unknown",
          }),
        ),
        Effect.mapError(
          (error) =>
            new EffectRateLimitError({
              message: error.message,
              code: "RATE_LIMIT_EXCEEDED",
              retryAfter: error.retryAfter,
            }),
        ),
      );

      // Check circuit breaker
      yield* self.rateLimiter.checkCircuitBreaker().pipe(
        Effect.tapError(() => Effect.logWarning("Circuit breaker is open")),
        Effect.mapError(
          (error) =>
            new ServiceUnavailableError({
              message: error.message,
              code: "CIRCUIT_BREAKER_OPEN",
              retryAfter: self.rateLimiter.getRetryAfterSeconds(),
            }),
        ),
      );

      // Consume a token
      yield* self.rateLimiter.consumeToken(task.userId).pipe(
        Effect.mapError(
          (error) =>
            new EffectRateLimitError({
              message: error.message,
              code: "TOKEN_CONSUMPTION_FAILED",
            }),
        ),
      );

      // Execute mutation based on type, handling special cases
      const taskResult = yield* self.executeTask(task).pipe(
        Effect.matchEffect({
          onFailure: (error) => self.handleTaskError(task, error),
          onSuccess: () => self.handleTaskSuccess(task),
        }),
      );

      return taskResult;
    });
  }

  private handleTaskError(
    task: MutationTask,
    error: MutationError,
  ): Effect.Effect<ExecuteMutationResponse, MutationError> {
    const self = this;

    return Effect.gen(function* () {
      // Handle RevokedRefreshTokenError specially - mark as FAILED but return success (HTTP 200) to stop retries
      if (error._tag === "DomainError" && error.code === "REVOKED_REFRESH_TOKEN") {
        const message = "Task failed (user revoked Yahoo access, not retried)";

        yield* Effect.annotateLogs(
          Effect.logWarning("Yahoo auth revoked - task marked failed without retry"),
          {
            errorCode: "REVOKED_REFRESH_TOKEN",
          },
        );

        yield* self.updateTaskStatus({
          taskId: task.id,
          status: "FAILED",
          message,
          error: "REVOKED_REFRESH_TOKEN",
        });

        // From a rate-limiter perspective, this is not a system/Yahoo failure
        yield* self.rateLimiter.recordSuccess();

        return {
          success: true,
          taskId: task.id,
          status: "FAILED",
          message,
          processedAt: new Date().toISOString(),
        };
      }

      // Handle different error types
      if (error._tag === "DomainError") {
        yield* Effect.annotateLogs(Effect.logError("Domain error during mutation"), {
          errorCode: error.code ?? "UNKNOWN",
        });

        yield* self.updateTaskStatus({
          taskId: task.id,
          status: "FAILED",
          message: error.message,
          error: error.code,
        });
        return yield* Effect.fail(error);
      }

      if (error._tag === "RateLimitError") {
        yield* Effect.annotateLogs(Effect.logWarning("Rate limit error during mutation"), {
          errorCode: error.code ?? "RATE_LIMIT",
          retryAfter: error.retryAfter ?? "unknown",
        });

        yield* self.rateLimiter.recordFailure(error);
        yield* self.updateTaskStatus({
          taskId: task.id,
          status: "FAILED",
          message: error.message,
          error: "RATE_LIMIT",
        });
        return yield* Effect.fail(error);
      }

      if (error._tag === "ServiceUnavailableError") {
        yield* Effect.annotateLogs(Effect.logWarning("Service unavailable error during mutation"), {
          errorCode: error.code ?? "SERVICE_UNAVAILABLE",
          retryAfter: error.retryAfter,
        });

        // Trigger global pause if this is a Yahoo maintenance error
        if (error.code === "YAHOO_MAINTENANCE") {
          yield* self.rateLimiter.triggerGlobalPause(
            "Yahoo API in maintenance/read-only mode",
            error.retryAfter * 1000, // Convert seconds to ms
          );
        }

        // Don't update task status to FAILED - let Cloud Tasks retry
        return yield* Effect.fail(error);
      }

      // System errors are retryable
      yield* Effect.annotateLogs(Effect.logError("System error during mutation"), {
        errorCode: error.code ?? "UNKNOWN",
        retryable: error._tag === "SystemError" ? error.retryable : false,
      });

      yield* self.updateTaskStatus({
        taskId: task.id,
        status: "FAILED",
        message: error.message,
        error: error.code,
      });
      return yield* Effect.fail(error);
    });
  }

  private handleTaskSuccess(task: MutationTask): Effect.Effect<ExecuteMutationResponse, never> {
    const self = this;

    return Effect.gen(function* () {
      yield* Effect.logInfo("Mutation completed successfully");

      yield* self.rateLimiter.recordSuccess();
      yield* self.updateTaskStatus({
        taskId: task.id,
        status: "COMPLETED",
        message: "Mutation completed successfully",
      });

      return {
        success: true,
        taskId: task.id,
        status: "COMPLETED",
        message: "Mutation completed successfully",
        processedAt: new Date().toISOString(),
      };
    });
  }

  private executeTask(task: MutationTask): Effect.Effect<void, MutationError> {
    switch (task.type) {
      case "SET_LINEUP":
        return this.executeSetLineup(task);
      case "WEEKLY_TRANSACTIONS":
        return this.executeWeeklyTransactions(task);
      case "CALC_POSITIONAL_SCARCITY":
        return this.executeCalcPositionalScarcity();
    }
  }

  private executeSetLineup(task: MutationTask): Effect.Effect<void, MutationError> {
    return Effect.gen(function* () {
      // Decode and validate payload
      const { uid, teams } = yield* Schema.decodeUnknown(SetLineupPayloadSchema)(task.payload).pipe(
        Effect.tapError(() => Effect.logError("Invalid payload")),
        Effect.mapError(
          (parseError) =>
            new DomainError({
              message: `Invalid payload: ${parseError.message}`,
              code: "INVALID_PAYLOAD",
              userId: task.userId,
            }),
        ),
      );

      yield* Effect.annotateLogs(Effect.logInfo("Starting lineup update"), {
        teamCount: teams.length,
      });

      // Call the set-lineup service with Yahoo service context
      yield* Effect.annotateLogs(
        setUsersLineup(uid, teams as readonly FirestoreTeam[]).pipe(
          Effect.catchAll((error): Effect.Effect<void, MutationError> => {
            if (isApiRateLimitError(error)) {
              return Effect.annotateLogs(Effect.logWarning("Rate limit hit"), {
                retryAfter: error.retryAfter ?? "unknown",
              }).pipe(
                Effect.andThen(
                  Effect.fail(
                    new EffectRateLimitError({
                      message: error.message,
                      code: "YAHOO_RATE_LIMIT",
                      retryAfter: error.retryAfter,
                    }),
                  ),
                ),
              );
            }

            if (isYahooMaintenanceError(error)) {
              return Effect.annotateLogs(Effect.logWarning("Yahoo in maintenance mode"), {
                retryAfter: error.retryAfterSeconds,
              }).pipe(
                Effect.andThen(
                  Effect.fail(
                    new ServiceUnavailableError({
                      message: error.message,
                      code: "YAHOO_MAINTENANCE",
                      retryAfter: error.retryAfterSeconds,
                    }),
                  ),
                ),
              );
            }

            if (isAuthorizationError(error)) {
              return Effect.ignore(
                Effect.tryPromise({
                  try: () => handleYahooAuthRevoked(uid),
                  catch: () => undefined,
                }),
              ).pipe(
                Effect.andThen(
                  Effect.fail(
                    new DomainError({
                      message: error.message,
                      code: "REVOKED_REFRESH_TOKEN",
                      userId: uid,
                    }),
                  ),
                ),
              );
            }

            // Check for RevokedRefreshTokenError
            if (error instanceof RevokedRefreshTokenError) {
              return Effect.fail(
                new DomainError({
                  message: error.message,
                  code: "REVOKED_REFRESH_TOKEN",
                  userId: uid,
                }),
              );
            }

            const errorMessage = error instanceof Error ? error.message : String(error);

            return Effect.annotateLogs(Effect.logError("Lineup update failed"), {
              errorMessage,
            }).pipe(
              Effect.andThen(
                Effect.fail(
                  new SystemError({
                    message: `Set lineup failed: ${errorMessage}`,
                    code: "SET_LINEUP_FAILED",
                    retryable: true,
                  }),
                ),
              ),
            );
          }),
        ),
        { service: "yahoo" },
      );

      yield* Effect.logInfo("Lineup update completed");
    });
  }

  private executeWeeklyTransactions(task: MutationTask): Effect.Effect<void, MutationError> {
    return Effect.gen(function* () {
      // Decode and validate payload
      const { uid, teams } = yield* Schema.decodeUnknown(WeeklyTransactionsPayloadSchema)(
        task.payload,
      ).pipe(
        Effect.tapError(() => Effect.logError("Invalid payload")),
        Effect.mapError(
          (parseError) =>
            new DomainError({
              message: `Invalid payload: ${parseError.message}`,
              code: "INVALID_PAYLOAD",
              userId: task.userId,
            }),
        ),
      );

      yield* Effect.annotateLogs(Effect.logInfo("Starting weekly transactions"), {
        teamCount: teams.length,
      });

      // Call the weekly-transactions service with Yahoo service context
      yield* Effect.annotateLogs(
        performWeeklyLeagueTransactions(uid, teams as readonly FirestoreTeam[]).pipe(
          Effect.catchAll((error): Effect.Effect<void, MutationError> => {
            if (isApiRateLimitError(error)) {
              return Effect.annotateLogs(Effect.logWarning("Rate limit hit"), {
                retryAfter: error.retryAfter ?? "unknown",
              }).pipe(
                Effect.andThen(
                  Effect.fail(
                    new EffectRateLimitError({
                      message: error.message,
                      code: "YAHOO_RATE_LIMIT",
                      retryAfter: error.retryAfter,
                    }),
                  ),
                ),
              );
            }

            if (isYahooMaintenanceError(error)) {
              return Effect.annotateLogs(Effect.logWarning("Yahoo in maintenance mode"), {
                retryAfter: error.retryAfterSeconds,
              }).pipe(
                Effect.andThen(
                  Effect.fail(
                    new ServiceUnavailableError({
                      message: error.message,
                      code: "YAHOO_MAINTENANCE",
                      retryAfter: error.retryAfterSeconds,
                    }),
                  ),
                ),
              );
            }

            if (isAuthorizationError(error)) {
              return Effect.ignore(
                Effect.tryPromise({
                  try: () => handleYahooAuthRevoked(uid),
                  catch: () => undefined,
                }),
              ).pipe(
                Effect.andThen(
                  Effect.fail(
                    new DomainError({
                      message: error.message,
                      code: "REVOKED_REFRESH_TOKEN",
                      userId: uid,
                    }),
                  ),
                ),
              );
            }

            const errorMessage = error instanceof Error ? error.message : String(error);

            return Effect.annotateLogs(Effect.logError("Transactions failed"), {
              errorMessage,
            }).pipe(
              Effect.andThen(
                Effect.fail(
                  new SystemError({
                    message: `Weekly transactions failed: ${errorMessage}`,
                    code: "WEEKLY_TRANSACTIONS_FAILED",
                    retryable: true,
                  }),
                ),
              ),
            );
          }),
        ),
        { service: "yahoo" },
      );

      yield* Effect.logInfo("Weekly transactions completed");
    });
  }

  private executeCalcPositionalScarcity(): Effect.Effect<void, MutationError> {
    return Effect.gen(function* () {
      yield* Effect.logInfo("Starting positional scarcity calculation");

      yield* recalculateScarcityOffsetsForAll().pipe(
        Effect.tapError((error) =>
          Effect.annotateLogs(Effect.logError("Calculation failed"), {
            errorMessage: error.message,
          }),
        ),
        Effect.mapError(
          (error) =>
            new SystemError({
              message: error.message,
              code: "CALC_POSITIONAL_SCARCITY_FAILED",
              retryable: true,
            }),
        ),
      );

      yield* Effect.logInfo("Positional scarcity calculation completed");
    });
  }

  updateTaskStatus(update: TaskStatusUpdate): Effect.Effect<void, never> {
    const self = this;
    return Effect.ignore(
      Effect.tryPromise({
        try: async () => {
          const docRef = self.firestore.collection("mutationTasks").doc(update.taskId);
          await docRef.update({
            status: update.status,
            message: update.message,
            error: update.error,
            updatedAt: new Date(),
          });
        },
        catch: () => {
          // Ignore errors in status updates
        },
      }).pipe(
        Effect.tap(() =>
          Effect.annotateLogs(Effect.logDebug("Task status updated"), { newStatus: update.status }),
        ),
      ),
    );
  }
}

/**
 * Context.Tag for the Execution service.
 * Use `Execution.layer` for production or create test layers.
 */
export class Execution extends Context.Tag("@mutation-api/Execution")<
  Execution,
  ExecutionService
>() {
  static layer(firestore: Firestore, rateLimiter: RateLimiterService): Layer.Layer<Execution> {
    return Layer.succeed(Execution, new ExecutionServiceImpl(firestore, rateLimiter));
  }
}
