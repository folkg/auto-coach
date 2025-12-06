import type { Firestore } from "@google-cloud/firestore";

import { Effect } from "effect";
import { Hono } from "hono";

import type { ErrorResponse, MutationError } from "../types/api-schemas";
import type { AuthContext } from "../types/hono-app-type";

import { ExecutionServiceImpl } from "../services/execution.service";
import { RateLimiterServiceImpl } from "../services/rate-limiter.service";
import { validateExecuteMutation } from "../validators";

/**
 * Converts a MutationError to an HTTP response format.
 * Exported for testing.
 */
export function errorToResponse(error: MutationError): {
  response: ErrorResponse;
  statusCode: 400 | 429 | 500;
  retryAfter: number | undefined;
} {
  const baseResponse: ErrorResponse = {
    error: "Mutation execution failed",
    message: error.message,
    code: error.code || error._tag,
  };

  if (error._tag === "RateLimitError") {
    return {
      response: {
        ...baseResponse,
        retryAfter: error.retryAfter,
      },
      statusCode: 429,
      retryAfter: error.retryAfter,
    };
  }

  let statusCode: 400 | 429 | 500 = 500;
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

    const result = await Effect.runPromise(
      executionService.executeMutation(request).pipe(
        Effect.match({
          onFailure: (error) => {
            const { response, statusCode, retryAfter } = errorToResponse(error);

            // Set Retry-After header for rate limit errors so Cloud Tasks respects backoff
            if (retryAfter !== undefined) {
              c.header("Retry-After", String(retryAfter));
            }

            // Log errors for debugging
            console.error(
              `[execution] Task ${request.task.id} failed for user ${request.task.userId}:`,
              JSON.stringify({
                code: error.code || error._tag,
                message: error.message,
                retryAfter,
              }),
            );
            return c.json(response, statusCode);
          },
          onSuccess: (response) => c.json(response, 200),
        }),
      ),
    );

    return result;
  });

  return app;
}
