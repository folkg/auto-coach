import { Data, Effect, Schema } from "effect";
import { FieldValue, type Firestore } from "@google-cloud/firestore";

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly message: string;
  readonly retryAfter?: number;
}> {}

export class CircuitBreakerError extends Data.TaggedError("CircuitBreakerError")<{
  readonly message: string;
  readonly isGlobalPause: boolean;
}> {}

export const RateLimitConfigSchema = Schema.Struct({
  maxTokens: Schema.Number.pipe(Schema.greaterThan(0)),
  refillRate: Schema.Number.pipe(Schema.greaterThan(0)),
  windowSizeMs: Schema.Number.pipe(Schema.greaterThan(0)),
});

export type RateLimitConfig = Schema.Schema.Type<typeof RateLimitConfigSchema>;

export interface RateLimiterService {
  checkRateLimit(userId: string): Effect.Effect<void, RateLimitError>;
  consumeToken(userId: string): Effect.Effect<void, RateLimitError>;
  checkCircuitBreaker(): Effect.Effect<void, CircuitBreakerError>;
  recordSuccess(): Effect.Effect<void, never>;
  recordFailure(error: Error): Effect.Effect<void, never>;
  triggerGlobalPause(reason: string, durationMs?: number): Effect.Effect<void, never>;
  clearGlobalPause(): Effect.Effect<void, never>;
}

export class RateLimiterServiceImpl implements RateLimiterService {
  private readonly firestore: Firestore;
  private readonly config: RateLimitConfig;

  constructor(firestore: Firestore, config: RateLimitConfig) {
    this.firestore = firestore;
    this.config = config;
  }

  checkRateLimit(userId: string): Effect.Effect<void, RateLimitError> {
    return Effect.tryPromise({
      try: async () => {
        const docRef = this.firestore.collection("rateLimits").doc(userId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return; // No rate limit data yet, allow request
        }

        const data = doc.data();
        if (!data) {
          return;
        }

        const now = Date.now();
        const windowStart = data.windowStart?.toMillis?.() || 0;
        const count = data.count || 0;

        // Reset window if expired
        if (now - windowStart > this.config.windowSizeMs) {
          return;
        }

        // Check if rate limit exceeded
        if (count >= this.config.maxTokens) {
          throw new RateLimitError({
            message: `Rate limit exceeded for user ${userId}`,
            retryAfter: Math.ceil(this.config.windowSizeMs / 1000),
          });
        }
      },
      catch: (error) => {
        if (error instanceof RateLimitError) {
          return error;
        }
        return new RateLimitError({
          message: `Failed to check rate limit: ${error instanceof Error ? error.message : String(error)}`,
        });
      },
    });
  }

  consumeToken(userId: string): Effect.Effect<void, RateLimitError> {
    return Effect.tryPromise({
      try: async () => {
        const docRef = this.firestore.collection("rateLimits").doc(userId);
        const now = Date.now();

        await this.firestore.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef);
          let newCount = 1;
          let windowStart = now;

          if (doc.exists) {
            const data = doc.data();
            if (!data) {
              return;
            }
            const existingWindowStart = data.windowStart?.toMillis?.() || 0;
            const existingCount = data.count || 0;

            // Reset window if expired
            if (now - existingWindowStart > this.config.windowSizeMs) {
              newCount = 1;
              windowStart = now;
            } else {
              newCount = existingCount + 1;
              windowStart = existingWindowStart;
            }
          }

          const rateLimitData = {
            count: newCount,
            windowStart: new Date(windowStart),
            windowSizeMs: this.config.windowSizeMs,
            lastUpdated: new Date(),
          };

          transaction.set(docRef, rateLimitData, { merge: true });
        });
      },
      catch: (error) =>
        new RateLimitError({
          message: `Failed to consume token: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  checkCircuitBreaker(): Effect.Effect<void, CircuitBreakerError> {
    return Effect.tryPromise({
      try: async () => {
        // Check global pause first
        const globalDocRef = this.firestore.collection("rateLimits").doc("global");
        const globalDoc = await globalDocRef.get();

        if (globalDoc.exists) {
          const globalData = globalDoc.data();
          if (globalData?.isPaused) {
            const pausedAt = globalData.pausedAt?.toMillis?.() || 0;
            const pauseDuration = globalData.pauseDurationMs || 300000; // 5 minutes default
            const now = Date.now();

            if (now - pausedAt < pauseDuration) {
              throw new CircuitBreakerError({
                message: `Globally paused: ${globalData.pauseReason || "Unknown reason"}`,
                isGlobalPause: true,
              });
            }
            // Auto-clear expired pause
            await globalDocRef.update({ isPaused: false });
          }
        }

        // Check circuit breaker state
        const cbDocRef = this.firestore.collection("rateLimits").doc("circuitBreaker");
        const cbDoc = await cbDocRef.get();

        if (!cbDoc.exists) {
          return;
        }

        const cbData = cbDoc.data();
        if (cbData?.isOpen) {
          const now = Date.now();
          const nextRetryTime = cbData.nextRetryTime?.toMillis?.() || 0;

          if (now < nextRetryTime) {
            throw new CircuitBreakerError({
              message: "Circuit breaker is open",
              isGlobalPause: false,
            });
          }
          // Attempt to close circuit breaker
          await cbDocRef.update({
            isOpen: false,
            failureCount: 0,
          });
        }
      },
      catch: (error) => {
        if (error instanceof CircuitBreakerError) {
          return error;
        }
        return new CircuitBreakerError({
          message: `Failed to check circuit breaker: ${error instanceof Error ? error.message : String(error)}`,
          isGlobalPause: false,
        });
      },
    });
  }

  recordSuccess(): Effect.Effect<void, never> {
    return Effect.ignore(
      Effect.tryPromise({
        try: async () => {
          const cbDocRef = this.firestore.collection("rateLimits").doc("circuitBreaker");
          await cbDocRef.update({
            isOpen: false,
            failureCount: FieldValue.delete(),
            lastFailureTime: FieldValue.delete(),
            nextRetryTime: FieldValue.delete(),
          });
        },
        catch: () => {
          // Ignore errors in success recording
        },
      }),
    );
  }

  recordFailure(error: Error): Effect.Effect<void, never> {
    return Effect.ignore(
      Effect.tryPromise({
        try: async () => {
          const isRateLimitError = error.message.includes("429") || error.message.includes("999");

          if (!isRateLimitError) {
            return; // Only trigger on rate limit errors
          }

          const cbDocRef = this.firestore.collection("rateLimits").doc("circuitBreaker");
          const now = new Date();
          let finalFailureCount = 1;

          await this.firestore.runTransaction(async (transaction) => {
            const doc = await transaction.get(cbDocRef);
            let failureCount = 1;
            let isOpen = false;
            let nextRetryTime = new Date(now.getTime() + 60000); // 1 minute retry

            if (doc.exists) {
              const data = doc.data();
              if (data) {
                failureCount = (data.failureCount || 0) + 1;

                // Open circuit breaker after 3 failures
                if (failureCount >= 3) {
                  isOpen = true;
                  nextRetryTime = new Date(now.getTime() + 300000); // 5 minutes retry
                }
              }
            }

            finalFailureCount = failureCount;

            const cbData = {
              isOpen,
              failureCount,
              lastFailureTime: now,
              nextRetryTime,
              lastUpdated: now,
            };

            transaction.set(cbDocRef, cbData, { merge: true });
          });

          // Trigger global pause on circuit breaker open
          if (finalFailureCount >= 3) {
            await Effect.runPromise(
              this.triggerGlobalPause("Circuit breaker opened due to rate limit errors", 300000),
            );
          }
        },
        catch: () => {
          // Ignore errors in failure recording
        },
      }),
    );
  }

  triggerGlobalPause(reason: string, durationMs = 300000): Effect.Effect<void, never> {
    return Effect.ignore(
      Effect.tryPromise({
        try: async () => {
          const globalDocRef = this.firestore.collection("rateLimits").doc("global");
          await globalDocRef.set({
            isPaused: true,
            pauseReason: reason,
            pausedAt: new Date(),
            pauseDurationMs: durationMs,
          });
        },
        catch: () => {
          // Ignore errors in pause triggering
        },
      }),
    );
  }

  clearGlobalPause(): Effect.Effect<void, never> {
    return Effect.ignore(
      Effect.tryPromise({
        try: async () => {
          const globalDocRef = this.firestore.collection("rateLimits").doc("global");
          await globalDocRef.update({
            isPaused: false,
          });
        },
        catch: () => {
          // Ignore errors in pause clearing
        },
      }),
    );
  }
}
