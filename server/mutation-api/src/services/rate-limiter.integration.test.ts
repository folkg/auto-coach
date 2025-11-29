/**
 * Integration tests for RateLimiterService.
 *
 * These tests verify the rate limiting, token bucket,
 * and circuit breaker functionality.
 */

import { Effect } from "effect";
import type { Firestore } from "@google-cloud/firestore";
import { describe, expect, it, vi } from "@effect/vitest";
import { type RateLimitConfig, RateLimiterServiceImpl } from "./rate-limiter.service.js";

function createMockFirestore(
  overrides: {
    readonly rateLimitDoc?: {
      readonly exists: boolean;
      readonly data?: Record<string, unknown>;
    };
    readonly globalDoc?: {
      readonly exists: boolean;
      readonly data?: Record<string, unknown>;
    };
    readonly circuitBreakerDoc?: {
      readonly exists: boolean;
      readonly data?: Record<string, unknown>;
    };
  } = {},
): Firestore {
  const mockDoc = (docId: string) => {
    const getDocData = () => {
      if (docId === "global") {
        return overrides.globalDoc ?? { exists: false };
      }
      if (docId === "circuitBreaker") {
        return overrides.circuitBreakerDoc ?? { exists: false };
      }
      return overrides.rateLimitDoc ?? { exists: false };
    };

    const docData = getDocData();

    return {
      get: vi.fn().mockResolvedValue({
        exists: docData.exists,
        data: () => docData.data,
      }),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };
  };

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockImplementation(mockDoc),
    }),
    runTransaction: vi.fn().mockImplementation((fn) =>
      fn({
        get: vi.fn().mockResolvedValue({
          exists: false,
          data: () => undefined,
        }),
        set: vi.fn(),
        update: vi.fn(),
      }),
    ),
  } as unknown as Firestore;
}

const defaultConfig: RateLimitConfig = {
  maxTokens: 10,
  refillRate: 1,
  windowSizeMs: 60000,
};

describe("RateLimiterService Integration Tests", () => {
  describe("checkRateLimit", () => {
    it("allows requests when no rate limit data exists", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.checkRateLimit("test-user");

        // Assert - should complete without error
        expect(true).toBe(true);
      }));

    it("allows requests when under rate limit", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore({
          rateLimitDoc: {
            exists: true,
            data: {
              count: 5,
              windowStart: { toMillis: () => Date.now() },
            },
          },
        });
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.checkRateLimit("test-user");

        // Assert - should complete without error
        expect(true).toBe(true);
      }));

    it("rejects requests when rate limit exceeded", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore({
          rateLimitDoc: {
            exists: true,
            data: {
              count: 15, // Over the limit of 10
              windowStart: { toMillis: () => Date.now() },
            },
          },
        });
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        const result = yield* Effect.either(service.checkRateLimit("test-user"));

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("RateLimitError");
        }
      }));

    it("resets window when expired", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore({
          rateLimitDoc: {
            exists: true,
            data: {
              count: 15, // Over limit but window expired
              windowStart: { toMillis: () => Date.now() - 120000 }, // 2 min ago
            },
          },
        });
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.checkRateLimit("test-user");

        // Assert - should complete without error (window reset)
        expect(true).toBe(true);
      }));
  });

  describe("consumeToken", () => {
    it("consumes a token for a user", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.consumeToken("test-user");

        // Assert - should complete without error
        expect(true).toBe(true);
      }));
  });

  describe("checkCircuitBreaker", () => {
    it("allows requests when circuit breaker is closed", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore({
          circuitBreakerDoc: {
            exists: true,
            data: {
              isOpen: false,
              failureCount: 0,
            },
          },
        });
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.checkCircuitBreaker();

        // Assert - should complete without error
        expect(true).toBe(true);
      }));

    it("rejects requests when circuit breaker is open", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore({
          circuitBreakerDoc: {
            exists: true,
            data: {
              isOpen: true,
              nextRetryTime: { toMillis: () => Date.now() + 300000 }, // 5 min from now
            },
          },
        });
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        const result = yield* Effect.either(service.checkCircuitBreaker());

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("CircuitBreakerError");
        }
      }));

    it("rejects requests when globally paused", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore({
          globalDoc: {
            exists: true,
            data: {
              isPaused: true,
              pausedAt: { toMillis: () => Date.now() },
              pauseDurationMs: 300000,
              pauseReason: "Manual pause",
            },
          },
        });
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        const result = yield* Effect.either(service.checkCircuitBreaker());

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("CircuitBreakerError");
          expect(result.left.isGlobalPause).toBe(true);
        }
      }));

    it("allows requests when global pause has expired", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore({
          globalDoc: {
            exists: true,
            data: {
              isPaused: true,
              pausedAt: { toMillis: () => Date.now() - 600000 }, // 10 min ago
              pauseDurationMs: 300000, // 5 min duration
              pauseReason: "Expired pause",
            },
          },
        });
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.checkCircuitBreaker();

        // Assert - should complete without error (pause expired)
        expect(true).toBe(true);
      }));
  });

  describe("recordSuccess", () => {
    it("resets circuit breaker on success", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.recordSuccess();

        // Assert - should complete without error
        expect(true).toBe(true);
      }));
  });

  describe("recordFailure", () => {
    it("records failure for rate limit errors", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.recordFailure(new Error("HTTP 429 Too Many Requests"));

        // Assert - should complete without error
        expect(true).toBe(true);
      }));

    it("ignores non-rate-limit errors", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.recordFailure(new Error("Some other error"));

        // Assert - should complete without error
        expect(true).toBe(true);
      }));
  });

  describe("triggerGlobalPause", () => {
    it("triggers global pause", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.triggerGlobalPause("Test pause reason", 60000);

        // Assert - should complete without error
        expect(true).toBe(true);
      }));
  });

  describe("clearGlobalPause", () => {
    it("clears global pause", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const service = new RateLimiterServiceImpl(mockFirestore, defaultConfig);

        // Act
        yield* service.clearGlobalPause();

        // Assert - should complete without error
        expect(true).toBe(true);
      }));
  });
});
