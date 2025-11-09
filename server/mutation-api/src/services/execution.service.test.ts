import type { FirestoreTeam } from "@common/types/team.js";
import { Effect, Either } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
  RateLimitError as ApiRateLimitError,
  DomainError,
  type ExecuteMutationRequest,
  SystemError,
} from "../types/api-schemas.js";
import { ExecutionServiceImpl } from "./execution.service.js";
import {
  CircuitBreakerError,
  type RateLimiterService,
} from "./rate-limiter.service.js";

// Mock set-lineup service
const mockSetUsersLineup = vi.fn();
vi.mock("./set-lineup.service.js", () => ({
  setUsersLineup: (...args: unknown[]) => mockSetUsersLineup(...args),
  SetLineupError: class {
    readonly _tag = "SetLineupError";
    readonly message: string;
    readonly uid?: string;
    constructor(opts: { message: string; uid?: string }) {
      this.message = opts.message;
      this.uid = opts.uid;
    }
  },
}));

// Mock weekly-transactions service
const mockPerformWeeklyLeagueTransactions = vi.fn();
vi.mock("./weekly-transactions.service.js", () => ({
  performWeeklyLeagueTransactions: (...args: unknown[]) =>
    mockPerformWeeklyLeagueTransactions(...args),
  WeeklyTransactionsError: class {
    readonly _tag = "WeeklyTransactionsError";
    readonly message: string;
    readonly uid?: string;
    constructor(opts: { message: string; uid?: string }) {
      this.message = opts.message;
      this.uid = opts.uid;
    }
  },
}));

// Mock positional-scarcity service
const mockRecalculateScarcityOffsetsForAll = vi.fn();
vi.mock("./positional-scarcity.service.js", () => ({
  recalculateScarcityOffsetsForAll: () =>
    mockRecalculateScarcityOffsetsForAll(),
}));

// Mock Firestore
vi.mock("@google-cloud/firestore", () => ({
  Firestore: vi.fn(),
}));

function createMockFirestoreTeam(
  overrides?: Partial<FirestoreTeam>,
): FirestoreTeam {
  return {
    team_key: "test.team.1",
    game_code: "nfl",
    start_date: 1640995200000,
    end_date: 1672531200000,
    weekly_deadline: "intraday",
    roster_positions: { QB: 1, RB: 2 },
    num_teams: 12,
    allow_transactions: true,
    allow_dropping: true,
    allow_adding: true,
    allow_add_drops: true,
    allow_waiver_adds: false,
    automated_transaction_processing: true,
    last_updated: Date.now(),
    lineup_paused_at: -1,
    uid: "test-user-id",
    is_subscribed: true,
    is_setting_lineups: true,
    ...overrides,
  };
}

function setupTest() {
  mockSetUsersLineup.mockClear();
  mockPerformWeeklyLeagueTransactions.mockClear();
  mockRecalculateScarcityOffsetsForAll.mockClear();

  const mockFirestore = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        update: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };

  const mockRateLimiter: RateLimiterService = {
    checkRateLimit: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    consumeToken: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    checkCircuitBreaker: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    recordSuccess: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    recordFailure: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    triggerGlobalPause: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    clearGlobalPause: vi.fn().mockReturnValue(Effect.succeed(undefined)),
  };

  const executionService = new ExecutionServiceImpl(
    // biome-ignore lint/suspicious/noExplicitAny: Firestore mock for testing
    mockFirestore as any,
    mockRateLimiter,
  );

  return {
    executionService,
    mockFirestore,
    mockRateLimiter,
  };
}

describe("ExecutionService", () => {
  describe("executeMutation - SET_LINEUP", () => {
    it("calls setUsersLineup with uid and teams from payload", async () => {
      // Arrange
      const { executionService } = setupTest();
      const mockTeam = createMockFirestoreTeam();

      mockSetUsersLineup.mockReturnValue(Effect.succeed(undefined));

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            uid: "test-user-id",
            teams: [mockTeam],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.success).toBe(true);
        expect(result.right.taskId).toBe("test-task-id");
        expect(result.right.status).toBe("COMPLETED");
      }
      expect(mockSetUsersLineup).toHaveBeenCalledWith("test-user-id", [
        mockTeam,
      ]);
    });

    it("handles RevokedRefreshTokenError gracefully without failing", async () => {
      // Arrange
      const { executionService } = setupTest();
      const mockTeam = createMockFirestoreTeam();

      // When the inner Effect.runPromise call throws, it gets caught by tryPromise's catch
      // We simulate this by returning an Effect that throws when run
      mockSetUsersLineup.mockImplementation(() => {
        const error = new Error("RevokedRefreshTokenError: Token was revoked");
        error.name = "SetLineupError";
        return Effect.fail(error);
      });

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            uid: "test-user-id",
            teams: [mockTeam],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert - Should complete successfully, not fail
      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.success).toBe(true);
        expect(result.right.status).toBe("COMPLETED");
        expect(result.right.message).toContain("token revoked");
      }
    });

    it("handles other SetLineupError as system error", async () => {
      // Arrange
      const { executionService } = setupTest();
      const mockTeam = createMockFirestoreTeam();

      mockSetUsersLineup.mockImplementation(() => {
        const error = new Error("Failed to fetch rosters from Yahoo");
        error.name = "SetLineupError";
        return Effect.fail(error);
      });

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            uid: "test-user-id",
            teams: [mockTeam],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(SystemError);
        expect(result.left.code).toBe("SET_LINEUP_FAILED");
      }
    });

    it("fails with invalid payload", async () => {
      // Arrange
      const { executionService } = setupTest();

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            invalid: "payload",
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(DomainError);
        expect(result.left.code).toBe("INVALID_PAYLOAD");
      }
    });
  });

  describe("executeMutation - WEEKLY_TRANSACTIONS", () => {
    it("calls performWeeklyLeagueTransactions with uid and teams", async () => {
      // Arrange
      const { executionService } = setupTest();
      const mockTeam = createMockFirestoreTeam();

      mockPerformWeeklyLeagueTransactions.mockReturnValue(
        Effect.succeed(undefined),
      );

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "WEEKLY_TRANSACTIONS",
          payload: {
            uid: "test-user-id",
            teams: [mockTeam],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.success).toBe(true);
        expect(result.right.status).toBe("COMPLETED");
      }
      expect(mockPerformWeeklyLeagueTransactions).toHaveBeenCalledWith(
        "test-user-id",
        [mockTeam],
      );
    });

    it("handles WeeklyTransactionsError as system error", async () => {
      // Arrange
      const { executionService } = setupTest();
      const mockTeam = createMockFirestoreTeam();

      mockPerformWeeklyLeagueTransactions.mockImplementation(() => {
        const error = new Error("Failed to process transactions");
        error.name = "WeeklyTransactionsError";
        return Effect.fail(error);
      });

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "WEEKLY_TRANSACTIONS",
          payload: {
            uid: "test-user-id",
            teams: [mockTeam],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(SystemError);
        expect(result.left.code).toBe("WEEKLY_TRANSACTIONS_FAILED");
      }
    });
  });

  describe("executeMutation - CALC_POSITIONAL_SCARCITY", () => {
    it("calls recalculateScarcityOffsetsForAll", async () => {
      // Arrange
      const { executionService } = setupTest();

      mockRecalculateScarcityOffsetsForAll.mockReturnValue(
        Effect.succeed(undefined),
      );

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "CALC_POSITIONAL_SCARCITY",
          payload: {},
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.success).toBe(true);
        expect(result.right.status).toBe("COMPLETED");
      }
      expect(mockRecalculateScarcityOffsetsForAll).toHaveBeenCalled();
    });
  });

  describe("rate limiting integration", () => {
    it("checks rate limit before executing", async () => {
      // Arrange
      const { executionService, mockRateLimiter } = setupTest();
      mockSetUsersLineup.mockReturnValue(Effect.succeed(undefined));

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            uid: "test-user-id",
            teams: [],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        "test-user-id",
      );
      expect(mockRateLimiter.consumeToken).toHaveBeenCalledWith("test-user-id");
    });

    it("fails when rate limit exceeded", async () => {
      // Arrange
      const { executionService, mockRateLimiter } = setupTest();

      (
        mockRateLimiter.checkRateLimit as ReturnType<typeof vi.fn>
      ).mockReturnValue(
        Effect.fail(
          new ApiRateLimitError({
            message: "Rate limit exceeded",
            code: "RATE_LIMIT",
            retryAfter: 60,
          }),
        ),
      );

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            uid: "test-user-id",
            teams: [],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(ApiRateLimitError);
        expect(result.left.message).toBe("Rate limit exceeded");
      }
    });

    it("fails when circuit breaker is open", async () => {
      // Arrange
      const { executionService, mockRateLimiter } = setupTest();

      (
        mockRateLimiter.checkCircuitBreaker as ReturnType<typeof vi.fn>
      ).mockReturnValue(
        Effect.fail(
          new CircuitBreakerError({
            message: "Circuit breaker is open",
            isGlobalPause: false,
          }),
        ),
      );

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            uid: "test-user-id",
            teams: [],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      const result = await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(ApiRateLimitError);
        expect(result.left.code).toBe("CIRCUIT_BREAKER_OPEN");
      }
    });

    it("records success on successful execution", async () => {
      // Arrange
      const { executionService, mockRateLimiter } = setupTest();
      mockSetUsersLineup.mockReturnValue(Effect.succeed(undefined));

      const request: ExecuteMutationRequest = {
        task: {
          id: "test-task-id",
          type: "SET_LINEUP",
          payload: {
            uid: "test-user-id",
            teams: [],
          },
          userId: "test-user-id",
          createdAt: "2023-01-01T00:00:00Z",
          status: "PENDING",
        },
      };

      // Act
      await Effect.runPromise(
        Effect.either(executionService.executeMutation(request)),
      );

      // Assert
      expect(mockRateLimiter.recordSuccess).toHaveBeenCalled();
    });
  });

  describe("updateTaskStatus", () => {
    it("updates task status in Firestore", async () => {
      // Arrange
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockFirestore = {
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            update: mockUpdate,
          })),
        })),
      };

      const mockRateLimiter: RateLimiterService = {
        checkRateLimit: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        consumeToken: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        checkCircuitBreaker: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        recordSuccess: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        recordFailure: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        triggerGlobalPause: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        clearGlobalPause: vi.fn().mockReturnValue(Effect.succeed(undefined)),
      };

      const executionService = new ExecutionServiceImpl(
        // biome-ignore lint/suspicious/noExplicitAny: Firestore mock for testing
        mockFirestore as any,
        mockRateLimiter,
      );

      const update = {
        taskId: "test-task-id",
        status: "COMPLETED" as const,
        message: "Test completed",
      };

      // Act
      await Effect.runPromise(executionService.updateTaskStatus(update));

      // Assert
      expect(mockFirestore.collection).toHaveBeenCalledWith("mutationTasks");
      expect(mockUpdate).toHaveBeenCalledWith({
        status: "COMPLETED",
        message: "Test completed",
        error: undefined,
        updatedAt: expect.any(Date),
      });
    });

    it("ignores errors in status updates", async () => {
      // Arrange
      const mockFirestore = {
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            update: vi.fn().mockRejectedValue(new Error("Firestore error")),
          })),
        })),
      };

      const mockRateLimiter: RateLimiterService = {
        checkRateLimit: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        consumeToken: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        checkCircuitBreaker: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        recordSuccess: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        recordFailure: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        triggerGlobalPause: vi.fn().mockReturnValue(Effect.succeed(undefined)),
        clearGlobalPause: vi.fn().mockReturnValue(Effect.succeed(undefined)),
      };

      const executionService = new ExecutionServiceImpl(
        // biome-ignore lint/suspicious/noExplicitAny: Firestore mock for testing
        mockFirestore as any,
        mockRateLimiter,
      );

      const update = {
        taskId: "test-task-id",
        status: "COMPLETED" as const,
        message: "Test completed",
      };

      // Act & Assert - Should not throw
      await expect(
        Effect.runPromise(executionService.updateTaskStatus(update)),
      ).resolves.toBeUndefined();
    });
  });
});
