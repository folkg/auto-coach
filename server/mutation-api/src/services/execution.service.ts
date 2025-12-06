import type { FirestoreTeam } from "@common/types/team.js";
import type { Firestore } from "@google-cloud/firestore";

import { Context, Effect, Layer, Schema } from "effect";

import type { MutationTask } from "../types/schemas.js";
import type { RateLimiterService } from "./rate-limiter.service.js";

import { RevokedRefreshTokenError } from "../../../core/src/common/services/firebase/errors.js";
import {
  RateLimitError as ApiRateLimitError,
  DomainError,
  type ExecuteMutationRequest,
  type ExecuteMutationResponse,
  type MutationError,
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
      // Update task status to PROCESSING
      yield* self.updateTaskStatus({
        taskId: task.id,
        status: "PROCESSING",
        message: "Starting mutation execution",
      });

      // TODO: We should probably also check this further down right before we call the yahoo api
      // - we could hit rate limits mid-process, and then still make way too many server calls
      // Check rate limits - retryAfter is propagated via HTTP Retry-After header from the route
      yield* self.rateLimiter.checkRateLimit(task.userId).pipe(
        Effect.mapError(
          (error) =>
            new ApiRateLimitError({
              message: error.message,
              code: "RATE_LIMIT_EXCEEDED",
              retryAfter: error.retryAfter,
            }),
        ),
      );

      // Check circuit breaker
      yield* self.rateLimiter.checkCircuitBreaker().pipe(
        Effect.mapError(
          (error) =>
            new ApiRateLimitError({
              message: error.message,
              code: "CIRCUIT_BREAKER_OPEN",
              retryAfter: 60,
            }),
        ),
      );

      // Consume a token
      yield* self.rateLimiter.consumeToken(task.userId).pipe(
        Effect.mapError(
          (error) =>
            new ApiRateLimitError({
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
      // Handle RevokedRefreshTokenError specially - log but don't fail
      if (error._tag === "DomainError" && error.code === "REVOKED_REFRESH_TOKEN") {
        yield* self.updateTaskStatus({
          taskId: task.id,
          status: "COMPLETED",
          message: "Task completed (user token revoked, logged)",
        });
        yield* self.rateLimiter.recordSuccess();
        return {
          success: true,
          taskId: task.id,
          status: "COMPLETED",
          message: "Task completed (user token revoked, logged)",
          processedAt: new Date().toISOString(),
        };
      }

      // Handle different error types
      if (error._tag === "DomainError") {
        yield* self.updateTaskStatus({
          taskId: task.id,
          status: "FAILED",
          message: error.message,
          error: error.code,
        });
        return yield* Effect.fail(error);
      }

      if (error._tag === "RateLimitError") {
        yield* self.rateLimiter.recordFailure(error);
        yield* self.updateTaskStatus({
          taskId: task.id,
          status: "FAILED",
          message: error.message,
          error: "RATE_LIMIT",
        });
        return yield* Effect.fail(error);
      }

      // System errors are retryable
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
        Effect.mapError(
          (parseError) =>
            new DomainError({
              message: `Invalid payload: ${parseError.message}`,
              code: "INVALID_PAYLOAD",
              userId: task.userId,
            }),
        ),
      );

      // Call the set-lineup service
      yield* setUsersLineup(uid, teams as readonly FirestoreTeam[]).pipe(
        Effect.catchAll((error): Effect.Effect<void, MutationError> => {
          if (error._tag === "SetLineupRateLimitError") {
            return Effect.fail(
              new ApiRateLimitError({
                message: error.message,
                code: "YAHOO_RATE_LIMIT",
                retryAfter: error.retryAfter,
              }),
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

          // TODO: This should be baked into the http layer, we can specificaly check for auth errors at the router level
          // Check for various auth-related errors that indicate revoked/expired tokens
          const isAuthError =
            errorMessage.includes("RevokedRefreshTokenError") ||
            errorMessage.includes("Forbidden access") ||
            errorMessage.includes("Invalid cookie") ||
            errorMessage.includes("please log in again") ||
            errorMessage.includes('status":401') ||
            errorMessage.includes('status":403');

          if (isAuthError) {
            return Effect.fail(
              new DomainError({
                message: errorMessage,
                code: "REVOKED_REFRESH_TOKEN",
                userId: uid,
              }),
            );
          }

          return Effect.fail(
            new SystemError({
              message: `Set lineup failed: ${errorMessage}`,
              code: "SET_LINEUP_FAILED",
              retryable: true,
            }),
          );
        }),
      );
    });
  }

  private executeWeeklyTransactions(task: MutationTask): Effect.Effect<void, MutationError> {
    return Effect.gen(function* () {
      // Decode and validate payload
      const { uid, teams } = yield* Schema.decodeUnknown(WeeklyTransactionsPayloadSchema)(
        task.payload,
      ).pipe(
        Effect.mapError(
          (parseError) =>
            new DomainError({
              message: `Invalid payload: ${parseError.message}`,
              code: "INVALID_PAYLOAD",
              userId: task.userId,
            }),
        ),
      );

      // Call the weekly-transactions service
      yield* performWeeklyLeagueTransactions(uid, teams as readonly FirestoreTeam[]).pipe(
        Effect.catchAll((error): Effect.Effect<void, MutationError> => {
          if (error._tag === "WeeklyTransactionsRateLimitError") {
            return Effect.fail(
              new ApiRateLimitError({
                message: error.message,
                code: "YAHOO_RATE_LIMIT",
                retryAfter: error.retryAfter,
              }),
            );
          }

          const errorMessage = error instanceof Error ? error.message : String(error);
          return Effect.fail(
            new SystemError({
              message: `Weekly transactions failed: ${errorMessage}`,
              code: "WEEKLY_TRANSACTIONS_FAILED",
              retryable: true,
            }),
          );
        }),
      );
    });
  }

  private executeCalcPositionalScarcity(): Effect.Effect<void, MutationError> {
    return recalculateScarcityOffsetsForAll().pipe(
      Effect.mapError(
        (error) =>
          new SystemError({
            message: error.message,
            code: "CALC_POSITIONAL_SCARCITY_FAILED",
            retryable: true,
          }),
      ),
    );
  }

  updateTaskStatus(update: TaskStatusUpdate): Effect.Effect<void, never> {
    return Effect.ignore(
      Effect.tryPromise({
        try: async () => {
          const docRef = this.firestore.collection("mutationTasks").doc(update.taskId);
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
      }),
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
