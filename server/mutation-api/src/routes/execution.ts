import type { Firestore } from "@google-cloud/firestore";

import { Effect } from "effect";
import { Hono } from "hono";

import type { ErrorResponse, MutationError } from "../types/api-schemas";
import type { AuthContext } from "../types/hono-app-type";

import { ExecutionServiceImpl } from "../services/execution.service";
import { ProductionLoggerLayer } from "../services/logger.service";
import { withExecutionContext } from "../services/logging-context";
import { RateLimiterServiceImpl } from "../services/rate-limiter.service";
import { validateExecuteMutation } from "../validators";

/**
 * Converts a MutationError to an HTTP response format.
 * Exported for testing.
 *
 * @param error - The mutation error to convert
 * @param defaultRetryAfterSeconds - Fallback retry-after value when not provided by the error
 */
export function errorToResponse(
  error: MutationError,
  defaultRetryAfterSeconds: number,
): {
  response: ErrorResponse;
  statusCode: 400 | 429 | 500 | 503;
  retryAfter: number | undefined;
} {
  const baseResponse: ErrorResponse = {
    error: "Mutation execution failed",
    message: error.message,
    code: error.code || error._tag,
  };

  if (error._tag === "ServiceUnavailableError") {
    const retryAfter = error.retryAfter;
    return {
      response: {
        ...baseResponse,
        retryAfter,
      },
      statusCode: 503,
      retryAfter,
    };
  }

  if (error._tag === "RateLimitError") {
    const retryAfter = error.retryAfter ?? defaultRetryAfterSeconds;
    return {
      response: {
        ...baseResponse,
        retryAfter,
      },
      statusCode: 429,
      retryAfter,
    };
  }

  let statusCode: 400 | 429 | 500 | 503 = 500;
  if (error._tag === "DomainError") {
    statusCode = 400;
  }

  return { response: baseResponse, statusCode, retryAfter: undefined };
}

export function createExecutionRoutes(firestore: Firestore) {
  const app = new Hono<AuthContext>();

  // Initialize services
  const rateLimiter = new RateLimiterServiceImpl(firestore, {
    maxTokens: 10,
    refillRate: 1,
    windowSizeMs: 60000, // 1 minute
  });

  const executionService = new ExecutionServiceImpl(firestore, rateLimiter);

  // POST /mutation - Core worker endpoint for Cloud Tasks
  app.post("/mutation", validateExecuteMutation, async (c) => {
    const request = c.req.valid("json");

    // Generate or use existing request ID for correlation
    const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.set("requestId", requestId);

    const result = await Effect.runPromise(
      withExecutionContext(
        {
          requestId,
          taskId: request.task.id,
          userId: request.task.userId,
          operation: request.task.type,
        },
        executionService.executeMutation(request).pipe(
          Effect.tapError((error) =>
            Effect.annotateLogs(Effect.logError("Mutation execution failed"), {
              errorTag: error._tag,
              errorCode: error.code ?? error._tag,
              errorMessage: error.message,
              outcome: "unhandled-error",
              terminated: true,
              retryAfter: error._tag === "RateLimitError" ? (error.retryAfter ?? "none") : "none",
            }),
          ),
          Effect.tap(() =>
            Effect.annotateLogs(Effect.logInfo("Mutation execution completed"), {
              outcome: "success",
            }),
          ),
          Effect.match({
            onFailure: (error) => {
              const { response, statusCode, retryAfter } = errorToResponse(
                error,
                rateLimiter.getRetryAfterSeconds(),
              );

              // Set Retry-After header for rate limit errors so Cloud Tasks respects backoff
              if (retryAfter !== undefined) {
                c.header("Retry-After", String(retryAfter));
              }

              return c.json(response, statusCode);
            },
            onSuccess: (response) => c.json(response, 200),
          }),
        ),
      ).pipe(Effect.provide(ProductionLoggerLayer)),
    );

    return result;
  });

  return app;
}
