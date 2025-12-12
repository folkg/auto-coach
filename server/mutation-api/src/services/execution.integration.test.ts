/**
 * Integration tests for ExecutionService.
 *
 * These tests verify the end-to-end mutation execution flow,
 * including rate limiting, circuit breaker, and task status updates.
 */

import type { Firestore } from "@google-cloud/firestore";

import { describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";

import type { MutationTask } from "../types/schemas.js";

import { ExecutionServiceImpl } from "./execution.service.js";
import {
  CircuitBreakerError,
  RateLimitError,
  type RateLimiterService,
} from "./rate-limiter.service.js";

// Mock RateLimiter for testing
function createMockRateLimiter(overrides: Partial<RateLimiterService> = {}): RateLimiterService {
  return {
    checkRateLimit: () => Effect.void,
    consumeToken: () => Effect.void,
    checkCircuitBreaker: () => Effect.void,
    recordSuccess: () => Effect.void,
    recordFailure: () => Effect.void,
    triggerGlobalPause: () => Effect.void,
    clearGlobalPause: () => Effect.void,
    getDefaultRetryAfterSeconds: () => 60,
    ...overrides,
  };
}

// Mock Firestore for testing
function createMockFirestore(): Firestore {
  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    runTransaction: vi.fn(),
  } as unknown as Firestore;
}

function createMockTask(overrides: Partial<MutationTask> = {}): MutationTask {
  return {
    id: "test-task-id",
    type: "SET_LINEUP",
    payload: { uid: "test-user", teams: [] },
    userId: "test-user-id",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    ...overrides,
  };
}

describe("ExecutionService Integration Tests", () => {
  describe("executeMutation", () => {
    it("executes SET_LINEUP mutation successfully", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const mockRateLimiter = createMockRateLimiter();
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        const task = createMockTask({
          type: "SET_LINEUP",
          payload: { uid: "test-user", teams: [] },
        });

        // Act
        const result = yield* executionService.executeMutation({ task });

        // Assert
        expect(result.success).toBe(true);
        expect(result.taskId).toBe(task.id);
        expect(result.status).toBe("COMPLETED");
      }));

    it("rejects execution when rate limit is exceeded", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const mockRateLimiter = createMockRateLimiter({
          checkRateLimit: () =>
            Effect.fail(
              new RateLimitError({
                message: "Rate limit exceeded",
                retryAfter: 60,
              }),
            ),
        });
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        const task = createMockTask();

        // Act
        const result = yield* Effect.either(executionService.executeMutation({ task }));

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("RateLimitError");
        }
      }));

    it("rejects execution when circuit breaker is open", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const mockRateLimiter = createMockRateLimiter({
          checkCircuitBreaker: () =>
            Effect.fail(
              new CircuitBreakerError({
                message: "Circuit breaker is open",
                isGlobalPause: false,
              }),
            ),
        });
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        const task = createMockTask();

        // Act
        const result = yield* Effect.either(executionService.executeMutation({ task }));

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("RateLimitError");
          expect(result.left.code).toBe("CIRCUIT_BREAKER_OPEN");
        }
      }));

    it("handles invalid payload gracefully", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = createMockFirestore();
        const mockRateLimiter = createMockRateLimiter();
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        const task = createMockTask({
          type: "SET_LINEUP",
          payload: { invalid: "payload" }, // Missing uid and teams
        });

        // Act
        const result = yield* Effect.either(executionService.executeMutation({ task }));

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("DomainError");
          expect(result.left.code).toBe("INVALID_PAYLOAD");
        }
      }));

    it("updates task status during execution lifecycle", () =>
      Effect.gen(function* () {
        // Arrange
        const statusUpdates: string[] = [];
        const mockFirestore = {
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false }),
              set: vi.fn().mockResolvedValue(undefined),
              update: vi.fn().mockImplementation((data) => {
                statusUpdates.push(data.status);
                return Promise.resolve(undefined);
              }),
            }),
          }),
        } as unknown as Firestore;

        const mockRateLimiter = createMockRateLimiter();
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        const task = createMockTask({
          type: "SET_LINEUP",
          payload: { uid: "test-user", teams: [] },
        });

        // Act
        yield* executionService.executeMutation({ task });

        // Assert - should have PROCESSING and COMPLETED status updates
        expect(statusUpdates).toContain("PROCESSING");
        expect(statusUpdates).toContain("COMPLETED");
      }));

    it("records success with rate limiter after successful execution", () =>
      Effect.gen(function* () {
        // Arrange
        let successRecorded = false;
        const mockFirestore = createMockFirestore();
        const mockRateLimiter = createMockRateLimiter({
          recordSuccess: () => {
            successRecorded = true;
            return Effect.void;
          },
        });
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        const task = createMockTask({
          type: "SET_LINEUP",
          payload: { uid: "test-user", teams: [] },
        });

        // Act
        yield* executionService.executeMutation({ task });

        // Assert
        expect(successRecorded).toBe(true);
      }));
  });

  describe("updateTaskStatus", () => {
    it("updates task status in Firestore", () =>
      Effect.gen(function* () {
        // Arrange
        let updatedData: Record<string, unknown> | undefined;
        const mockFirestore = {
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              update: vi.fn().mockImplementation((data) => {
                updatedData = data;
                return Promise.resolve(undefined);
              }),
            }),
          }),
        } as unknown as Firestore;

        const mockRateLimiter = createMockRateLimiter();
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        // Act
        yield* executionService.updateTaskStatus({
          taskId: "test-task-123",
          status: "COMPLETED",
          message: "Task completed successfully",
        });

        // Assert
        expect(updatedData?.status).toBe("COMPLETED");
        expect(updatedData?.message).toBe("Task completed successfully");
      }));

    it("silently ignores Firestore errors during status update", () =>
      Effect.gen(function* () {
        // Arrange
        const mockFirestore = {
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              update: vi.fn().mockRejectedValue(new Error("Firestore error")),
            }),
          }),
        } as unknown as Firestore;

        const mockRateLimiter = createMockRateLimiter();
        const executionService = new ExecutionServiceImpl(mockFirestore, mockRateLimiter);

        // Act - should not throw
        yield* executionService.updateTaskStatus({
          taskId: "test-task-123",
          status: "COMPLETED",
          message: "Test",
        });

        // Assert - execution completes without error
        expect(true).toBe(true);
      }));
  });
});
