/**
 * Integration tests for DispatchService using MSW to mock external APIs.
 *
 * These tests verify the end-to-end dispatch flows for set-lineup,
 * weekly transactions, and positional scarcity calculations.
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";
import {
  DispatchServiceImpl,
  FirestoreService,
  PositionalScarcityService,
  SchedulingService,
  TimeService,
  WeeklyTransactionsService,
} from "./dispatch.service.js";
import { PositionalScarcityError } from "./positional-scarcity.service.js";
import type { TeamData } from "./scheduling.service.js";
import { WeeklyTransactionsError } from "./weekly-transactions.service.js";

describe("DispatchService Integration Tests", () => {
  describe("dispatchSetLineup", () => {
    it("skips lineup setting at midnight (hour 0)", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const testLayer = Layer.mergeAll(
          Layer.succeed(TimeService, {
            getCurrentPacificHour: () => 0,
          }),
          Layer.succeed(SchedulingService, {
            leaguesToSetLineupsFor: () => Effect.succeed([]),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => new Map(),
            enqueueUsersTeams: () => Effect.succeed([]),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () =>
              Promise.resolve(createMockTeamsSnapshot([])),
          }),
        );

        // Act
        const result = yield* dispatchService
          .dispatchSetLineup({
            userId: "test-user",
            teamKey: "test.t.123",
            lineupChanges: [],
          })
          .pipe(Effect.provide(testLayer));

        // Assert
        expect(result.success).toBe(true);
        expect(result.taskCount).toBe(0);
        expect(result.message).toContain("midnight");
      }));

    it("returns early when no leagues have games starting", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const testLayer = Layer.mergeAll(
          Layer.succeed(TimeService, {
            getCurrentPacificHour: () => 10,
          }),
          Layer.succeed(SchedulingService, {
            leaguesToSetLineupsFor: () => Effect.succeed([]),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => new Map(),
            enqueueUsersTeams: () => Effect.succeed([]),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () =>
              Promise.resolve(createMockTeamsSnapshot([])),
          }),
        );

        // Act
        const result = yield* dispatchService
          .dispatchSetLineup({
            userId: "test-user",
            teamKey: "test.t.123",
            lineupChanges: [],
          })
          .pipe(Effect.provide(testLayer));

        // Assert
        expect(result.success).toBe(true);
        expect(result.taskCount).toBe(0);
        expect(result.message).toContain("No leagues");
      }));

    it("enqueues tasks for active users with teams in active leagues", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const now = Date.now();
        const activeUsers = new Map<string, TeamData[]>([
          [
            "user1",
            [
              {
                uid: "user1",
                game_code: "nba",
                start_date: now - 1000,
                team_key: "nba.t.123",
              },
            ],
          ],
          [
            "user2",
            [
              {
                uid: "user2",
                game_code: "nhl",
                start_date: now - 1000,
                team_key: "nhl.t.456",
              },
            ],
          ],
        ]);

        const enqueuedTasks = [{ uid: "user1" }, { uid: "user2" }];

        const testLayer = Layer.mergeAll(
          Layer.succeed(TimeService, {
            getCurrentPacificHour: () => 10,
          }),
          Layer.succeed(SchedulingService, {
            leaguesToSetLineupsFor: () => Effect.succeed(["nba", "nhl"]),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => activeUsers,
            enqueueUsersTeams: () => Effect.succeed(enqueuedTasks),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () =>
              Promise.resolve(
                createMockTeamsSnapshot([
                  {
                    id: "nba.t.123",
                    data: {
                      uid: "user1",
                      game_code: "nba",
                      start_date: now - 1000,
                    },
                  },
                  {
                    id: "nhl.t.456",
                    data: {
                      uid: "user2",
                      game_code: "nhl",
                      start_date: now - 1000,
                    },
                  },
                ]),
              ),
          }),
        );

        // Act
        const result = yield* dispatchService
          .dispatchSetLineup({
            userId: "test-user",
            teamKey: "test.t.123",
            lineupChanges: [],
          })
          .pipe(Effect.provide(testLayer));

        // Assert
        expect(result.success).toBe(true);
        expect(result.taskCount).toBe(2);
        expect(result.message).toContain("enqueued 2");
      }));

    it("returns success with zero tasks when no active users", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const testLayer = Layer.mergeAll(
          Layer.succeed(TimeService, {
            getCurrentPacificHour: () => 10,
          }),
          Layer.succeed(SchedulingService, {
            leaguesToSetLineupsFor: () => Effect.succeed(["nba"]),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => new Map(),
            enqueueUsersTeams: () => Effect.succeed([]),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () =>
              Promise.resolve(createMockTeamsSnapshot([])),
          }),
        );

        // Act
        const result = yield* dispatchService
          .dispatchSetLineup({
            userId: "test-user",
            teamKey: "test.t.123",
            lineupChanges: [],
          })
          .pipe(Effect.provide(testLayer));

        // Assert
        expect(result.success).toBe(true);
        expect(result.taskCount).toBe(0);
        expect(result.message).toContain("No active users");
      }));
  });

  describe("dispatchWeeklyTransactions", () => {
    it("schedules weekly transactions successfully", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const testLayer = Layer.succeed(WeeklyTransactionsService, {
          scheduleWeeklyLeagueTransactions: () => Effect.void,
        });

        // Act
        const result = yield* dispatchService
          .dispatchWeeklyTransactions({
            userId: "test-user",
            teamKey: "test.t.123",
            transactions: [],
          })
          .pipe(Effect.provide(testLayer));

        // Assert
        expect(result.success).toBe(true);
        expect(result.message).toContain("scheduled successfully");
      }));

    it("propagates errors from weekly transactions service", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const testLayer = Layer.succeed(WeeklyTransactionsService, {
          scheduleWeeklyLeagueTransactions: () =>
            Effect.fail(
              new WeeklyTransactionsError({
                message: "Failed to schedule transactions",
              }),
            ),
        });

        // Act
        const result = yield* Effect.either(
          dispatchService
            .dispatchWeeklyTransactions({
              userId: "test-user",
              teamKey: "test.t.123",
              transactions: [],
            })
            .pipe(Effect.provide(testLayer)),
        );

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.message).toContain("Failed to schedule");
        }
      }));
  });

  describe("dispatchCalcPositionalScarcity", () => {
    it("calculates positional scarcity successfully", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const testLayer = Layer.succeed(PositionalScarcityService, {
          recalculateScarcityOffsetsForAll: () => Effect.void,
        });

        // Act
        const result = yield* dispatchService
          .dispatchCalcPositionalScarcity({
            userId: "test-user",
            leagueKey: "nba.l.12345",
          })
          .pipe(Effect.provide(testLayer));

        // Assert
        expect(result.success).toBe(true);
        expect(result.taskCount).toBe(1);
        expect(result.message).toContain("nba.l.12345");
      }));

    it("propagates errors from positional scarcity service", () =>
      Effect.gen(function* () {
        // Arrange
        const dispatchService = new DispatchServiceImpl();

        const testLayer = Layer.succeed(PositionalScarcityService, {
          recalculateScarcityOffsetsForAll: () =>
            Effect.fail(
              new PositionalScarcityError({
                message: "Failed to calculate scarcity",
              }),
            ),
        });

        // Act
        const result = yield* Effect.either(
          dispatchService
            .dispatchCalcPositionalScarcity({
              userId: "test-user",
              leagueKey: "nba.l.12345",
            })
            .pipe(Effect.provide(testLayer)),
        );

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.message).toContain("Failed to calculate");
        }
      }));
  });
});

// Helper to create mock Firestore QuerySnapshot
function createMockTeamsSnapshot(
  teams: ReadonlyArray<{
    readonly id: string;
    readonly data: { uid: string; game_code: string; start_date: number };
  }>,
): QuerySnapshot<DocumentData> {
  const docs = teams.map((team) => ({
    id: team.id,
    data: () => team.data,
  }));

  return {
    size: docs.length,
    docs,
  } as unknown as QuerySnapshot<DocumentData>;
}
