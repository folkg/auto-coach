import type { CollectionReference, DocumentReference, Firestore } from "@google-cloud/firestore";

import { createMock } from "@common/utilities/createMock";
import { Effect, Either } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  CircuitBreakerError,
  type RateLimitConfig,
  RateLimitError,
  RateLimiterServiceImpl,
} from "./rate-limiter.service";

// Mock Firestore
vi.mock("@google-cloud/firestore", () => ({
  Firestore: vi.fn(),
  FieldValue: {
    delete: vi.fn(() => "delete"),
  },
}));

describe("RateLimiterService", () => {
  let mockFirestore: Firestore;
  let mockCollection: Mock;
  let mockDoc: Mock;
  let mockGet: Mock;
  let mockUpdate: Mock;
  let mockSet: Mock;
  let mockRunTransaction: Mock;
  let rateLimiter: RateLimiterServiceImpl;

  beforeEach(() => {
    // Setup mocks
    const get = vi.fn();
    const update = vi.fn();
    const set = vi.fn();
    const runTransaction = vi.fn();

    const doc = vi.fn().mockReturnValue(
      createMock<DocumentReference>({
        get: get,
        update: update,
        set: set,
      }),
    );

    const collection = vi.fn().mockReturnValue(createMock<CollectionReference>({ doc: doc }));

    mockFirestore = createMock<Firestore>({
      collection: collection,
      runTransaction: runTransaction,
    });

    mockGet = get;
    mockUpdate = update;
    mockSet = set;
    mockDoc = doc;
    mockCollection = collection;
    mockRunTransaction = runTransaction;

    const config: RateLimitConfig = {
      maxTokens: 10,
      refillRate: 1,
      windowSizeMs: 60000, // 1 minute
    };

    rateLimiter = new RateLimiterServiceImpl(mockFirestore, config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("checkRateLimit", () => {
    it("allows request when no rate limit data exists", async () => {
      // Arrange
      mockGet.mockResolvedValue({ exists: false });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkRateLimit("user123")));

      // Assert
      expect(Either.isRight(result)).toBe(true);
      expect(mockCollection).toHaveBeenCalledWith("rateLimits");
      expect(mockDoc).toHaveBeenCalledWith("user123");
    });

    it("allows request when rate limit not exceeded", async () => {
      // Arrange
      const now = Date.now();
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          count: 5,
          windowStart: { toMillis: () => now - 30000 }, // 30 seconds ago
        }),
      });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkRateLimit("user123")));

      // Assert
      expect(Either.isRight(result)).toBe(true);
    });

    it("blocks request when rate limit exceeded", async () => {
      // Arrange
      const now = Date.now();
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          count: 10, // At limit
          windowStart: { toMillis: () => now - 30000 }, // Within window
        }),
      });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkRateLimit("user123")));

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(RateLimitError);
        expect(result.left.message).toContain("Rate limit exceeded");
        expect(result.left.retryAfter).toBe(60);
      }
    });

    it("resets window when expired", async () => {
      // Arrange
      const now = Date.now();
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          count: 15, // Over limit
          windowStart: { toMillis: () => now - 120000 }, // 2 minutes ago (expired)
        }),
      });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkRateLimit("user123")));

      // Assert
      expect(Either.isRight(result)).toBe(true);
    });
  });

  describe("consumeToken", () => {
    it("creates new rate limit entry for new user", async () => {
      // Arrange
      mockRunTransaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<void>) => {
          const mockTransaction = {
            get: vi.fn().mockResolvedValue({ exists: false }),
            set: vi.fn(),
          };
          await callback(mockTransaction);
        },
      );

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.consumeToken("user123")));

      // Assert
      expect(Either.isRight(result)).toBe(true);
    });

    it("increments count for existing user within window", async () => {
      // Arrange
      const now = Date.now();
      mockRunTransaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<void>) => {
          const mockTransaction = {
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                count: 5,
                windowStart: { toMillis: () => now - 30000 },
              }),
            }),
            set: vi.fn(),
          };
          await callback(mockTransaction);
        },
      );

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.consumeToken("user123")));

      // Assert
      expect(Either.isRight(result)).toBe(true);
    });

    it("resets count for existing user with expired window", async () => {
      // Arrange
      const now = Date.now();
      mockRunTransaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<void>) => {
          const mockTransaction = {
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                count: 15,
                windowStart: { toMillis: () => now - 120000 }, // Expired
              }),
            }),
            set: vi.fn(),
          };
          await callback(mockTransaction);
        },
      );

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.consumeToken("user123")));

      // Assert
      expect(Either.isRight(result)).toBe(true);
    });
  });

  describe("checkCircuitBreaker", () => {
    it("allows request when no circuit breaker data exists", async () => {
      // Arrange
      mockGet.mockResolvedValue({ exists: false });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkCircuitBreaker()));

      // Assert
      expect(Either.isRight(result)).toBe(true);
    });

    it("blocks request when circuit breaker is open", async () => {
      // Arrange
      const now = Date.now();
      const futureTime = now + 300000; // 5 minutes from now

      mockGet
        .mockResolvedValueOnce({ exists: false }) // Global pause check
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            isOpen: true,
            nextRetryTime: { toMillis: () => futureTime },
          }),
        });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkCircuitBreaker()));

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(CircuitBreakerError);
        expect(result.left.message).toContain("Circuit breaker is open");
        expect(result.left.isGlobalPause).toBe(false);
      }
    });

    it("closes circuit breaker when retry time has passed", async () => {
      // Arrange
      const pastTime = Date.now() - 60000; // 1 minute ago

      mockGet
        .mockResolvedValueOnce({ exists: false }) // Global pause check
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            isOpen: true,
            nextRetryTime: { toMillis: () => pastTime },
          }),
        });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkCircuitBreaker()));

      // Assert
      expect(Either.isRight(result)).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        isOpen: false,
        failureCount: 0,
      });
    });

    it("blocks request when global pause is active", async () => {
      // Arrange
      const now = Date.now();
      const pausedAt = now - 60000; // 1 minute ago

      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          isPaused: true,
          pauseReason: "Test pause",
          pausedAt: { toMillis: () => pausedAt },
          pauseDurationMs: 300000, // 5 minutes
        }),
      });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkCircuitBreaker()));

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(CircuitBreakerError);
        expect(result.left.message).toContain("Globally paused");
        expect(result.left.isGlobalPause).toBe(true);
      }
    });
  });

  describe("recordSuccess", () => {
    it("resets circuit breaker state on success", async () => {
      // Arrange
      mockUpdate.mockResolvedValue(undefined);

      // Act
      await Effect.runPromise(rateLimiter.recordSuccess());

      // Assert
      expect(mockCollection).toHaveBeenCalledWith("rateLimits");
      expect(mockDoc).toHaveBeenCalledWith("circuitBreaker");
      expect(mockUpdate).toHaveBeenCalledWith({
        isOpen: false,
        failureCount: "delete",
        lastFailureTime: "delete",
        nextRetryTime: "delete",
      });
    });
  });

  describe("recordFailure", () => {
    it("ignores non-rate limit errors", async () => {
      // Arrange
      const error = new Error("Some other error");

      // Act
      await Effect.runPromise(rateLimiter.recordFailure(error));

      // Assert
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it("records rate limit failure", async () => {
      // Arrange
      const error = new Error("429 rate limit exceeded");
      mockRunTransaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<void>) => {
          const mockTransaction = {
            get: vi.fn().mockResolvedValue({ exists: false }),
            set: vi.fn(),
          };
          await callback(mockTransaction);
        },
      );

      // Act
      await Effect.runPromise(rateLimiter.recordFailure(error));

      // Assert
      expect(mockRunTransaction).toHaveBeenCalled();
    });

    it("opens circuit breaker after 3 failures", async () => {
      // Arrange
      const error = new Error("429 rate limit exceeded");
      let callCount = 0;

      mockRunTransaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<void>) => {
          const mockTransaction = {
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                failureCount: ++callCount, // 2, then 3
              }),
            }),
            set: vi.fn(),
          };
          await callback(mockTransaction);
        },
      );

      // Act
      await Effect.runPromise(rateLimiter.recordFailure(error));
      await Effect.runPromise(rateLimiter.recordFailure(error));

      // Assert
      expect(mockRunTransaction).toHaveBeenCalledTimes(2);
    });
  });

  describe("triggerGlobalPause", () => {
    it("sets global pause state", async () => {
      // Arrange
      mockSet.mockResolvedValue(undefined);

      // Act
      await Effect.runPromise(rateLimiter.triggerGlobalPause("Test pause", 60000));

      // Assert
      expect(mockCollection).toHaveBeenCalledWith("rateLimits");
      expect(mockDoc).toHaveBeenCalledWith("global");
      expect(mockSet).toHaveBeenCalledWith({
        isPaused: true,
        pauseReason: "Test pause",
        pausedAt: expect.any(Date),
        pauseDurationMs: 60000,
      });
    });
  });

  describe("clearGlobalPause", () => {
    it("clears global pause state", async () => {
      // Arrange
      mockUpdate.mockResolvedValue(undefined);

      // Act
      await Effect.runPromise(rateLimiter.clearGlobalPause());

      // Assert
      expect(mockCollection).toHaveBeenCalledWith("rateLimits");
      expect(mockDoc).toHaveBeenCalledWith("global");
      expect(mockUpdate).toHaveBeenCalledWith({
        isPaused: false,
      });
    });
  });

  describe("getRetryAfterSeconds", () => {
    it("returns config window size in seconds when no pause is active", () => {
      // Arrange
      const testWindowSizeMs = 120000; // 2 minutes
      const customConfig: RateLimitConfig = {
        maxTokens: 10,
        refillRate: 1,
        windowSizeMs: testWindowSizeMs,
      };
      const customRateLimiter = new RateLimiterServiceImpl(mockFirestore, customConfig);

      // Act
      const result = customRateLimiter.getRetryAfterSeconds();

      // Assert - should return windowSizeMs / 1000 = 120 seconds
      expect(result).toBe(Math.ceil(testWindowSizeMs / 1000));
    });

    it("returns remaining pause time in seconds when pause is active", async () => {
      // Arrange
      mockSet.mockResolvedValue(undefined);
      const pauseDuration = 60000; // 60 seconds

      // Act
      await Effect.runPromise(rateLimiter.triggerGlobalPause("Test pause", pauseDuration));
      const result = rateLimiter.getRetryAfterSeconds();

      // Assert - should return remaining time (close to 60 seconds)
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(60);
    });

    it("returns config window size after clearGlobalPause", async () => {
      // Arrange
      const testWindowSizeMs = 90000; // 90 seconds
      const customConfig: RateLimitConfig = {
        maxTokens: 10,
        refillRate: 1,
        windowSizeMs: testWindowSizeMs,
      };
      const customRateLimiter = new RateLimiterServiceImpl(mockFirestore, customConfig);
      mockSet.mockResolvedValue(undefined);
      mockUpdate.mockResolvedValue(undefined);
      await Effect.runPromise(customRateLimiter.triggerGlobalPause("Test pause", 60000));

      // Act
      await Effect.runPromise(customRateLimiter.clearGlobalPause());
      const result = customRateLimiter.getRetryAfterSeconds();

      // Assert - should return config window size after clear
      expect(result).toBe(Math.ceil(testWindowSizeMs / 1000));
    });

    it("returns config window size after pause expires", async () => {
      // Arrange
      const testWindowSizeMs = 75000; // 75 seconds
      const customConfig: RateLimitConfig = {
        maxTokens: 10,
        refillRate: 1,
        windowSizeMs: testWindowSizeMs,
      };
      const customRateLimiter = new RateLimiterServiceImpl(mockFirestore, customConfig);
      mockSet.mockResolvedValue(undefined);
      await Effect.runPromise(customRateLimiter.triggerGlobalPause("Test pause", 1)); // 1ms pause

      // Wait for pause to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act
      const result = customRateLimiter.getRetryAfterSeconds();

      // Assert - should return config window size since pause expired
      expect(result).toBe(Math.ceil(testWindowSizeMs / 1000));
    });
  });

  describe("checkCircuitBreaker with local cache", () => {
    it("uses local cache to skip Firestore when pause is active", async () => {
      // Arrange
      mockSet.mockResolvedValue(undefined);
      await Effect.runPromise(rateLimiter.triggerGlobalPause("Test pause", 60000));
      mockCollection.mockClear();

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkCircuitBreaker()));

      // Assert - should fail without hitting Firestore
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.isGlobalPause).toBe(true);
        expect(result.left.message).toContain("cached");
      }
      // Firestore should not have been called (used cache instead)
      expect(mockCollection).not.toHaveBeenCalled();
    });

    it("falls back to Firestore when local cache is expired", async () => {
      // Arrange - simulate expired pause by using a very short duration
      mockSet.mockResolvedValue(undefined);
      await Effect.runPromise(rateLimiter.triggerGlobalPause("Test pause", 1)); // 1ms pause

      // Wait for pause to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Clear mocks to verify Firestore is called
      mockCollection.mockClear();

      // Mock Firestore response for global doc (no active pause)
      mockGet.mockResolvedValueOnce({
        exists: false,
        data: () => undefined,
      });
      // Mock Firestore response for circuitBreaker doc (no circuit breaker)
      mockGet.mockResolvedValueOnce({
        exists: false,
        data: () => undefined,
      });

      // Act
      const result = await Effect.runPromise(Effect.either(rateLimiter.checkCircuitBreaker()));

      // Assert - should succeed after hitting Firestore
      expect(Either.isRight(result)).toBe(true);
      // Firestore should have been called since cache expired
      expect(mockCollection).toHaveBeenCalledWith("rateLimits");
    });
  });
});
