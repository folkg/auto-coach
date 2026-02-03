/**
 * Integration tests for DispatchService using MSW to mock external APIs.
 *
 * These tests verify the end-to-end dispatch flows for set-lineup,
 * weekly transactions, and positional scarcity calculations.
 */

import type { Leagues } from "@common/types/Leagues.js";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  DispatchServiceImpl,
  FirestoreService,
  PositionalScarcityService,
  SchedulingService,
  TimeService,
  WeeklyTransactionsService,
} from "./dispatch.service.js";
import { PositionalScarcityError } from "./positional-scarcity.service.js";
import { type FirestoreTeamPayload, type ScheduleInfo } from "./scheduling.service.js";
import { WeeklyTransactionsError } from "./weekly-transactions.service.js";

/**
 * Creates a complete FirestoreTeamPayload with sensible defaults.
 */
function createMockTeamPayload(
  overrides: Partial<FirestoreTeamPayload> & {
    uid: string;
    game_code: Leagues;
    start_date: number;
  },
): FirestoreTeamPayload {
  return {
    team_key: "test-team-key",
    end_date: Date.now() + 86400000 * 180,
    weekly_deadline: "intraday",
    roster_positions: { C: 1, LW: 2, RW: 2, D: 4, G: 2, BN: 4, IR: 2 },
    num_teams: 12,
    allow_transactions: true,
    allow_dropping: true,
    allow_adding: true,
    allow_add_drops: true,
    allow_waiver_adds: true,
    automated_transaction_processing: false,
    last_updated: -1,
    is_subscribed: true,
    is_setting_lineups: true,
    lineup_failure_count: 0,
    last_lineup_failure_at: -1,
    lineup_paused_at: -1,
    ...overrides,
  };
}

function createMockScheduleInfo(overrides?: Partial<ScheduleInfo>): ScheduleInfo {
  return {
    leagues: [],
    leaguesWithGamesToday: [],
    ...overrides,
  };
}

// Helper to create mock Firestore QuerySnapshot
function createMockTeamsSnapshot(
  teams: ReadonlyArray<{
    readonly id: string;
    readonly data: FirestoreTeamPayload;
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
            getScheduleInfo: () => Effect.succeed(createMockScheduleInfo()),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => Effect.succeed(new Map()),
            enqueueUsersTeams: () => Effect.succeed([]),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () => Promise.resolve(createMockTeamsSnapshot([])),
          }),
        );

        // Act
        const result = yield* dispatchService
          .dispatchSetLineup({
            userId: "test-user",
            teamKey: "test.t.123",
            lineupChanges: [],
            skipGamesCheck: false,
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
            getScheduleInfo: () => Effect.succeed(createMockScheduleInfo()),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => Effect.succeed(new Map()),
            enqueueUsersTeams: () => Effect.succeed([]),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () => Promise.resolve(createMockTeamsSnapshot([])),
          }),
        );

        // Act
        const result = yield* dispatchService
          .dispatchSetLineup({
            userId: "test-user",
            teamKey: "test.t.123",
            lineupChanges: [],
            skipGamesCheck: false,
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
        const activeUsers = new Map<string, FirestoreTeamPayload[]>([
          [
            "user1",
            [
              createMockTeamPayload({
                uid: "user1",
                game_code: "nba" as Leagues,
                start_date: now - 1000,
                team_key: "nba.t.123",
              }),
            ],
          ],
          [
            "user2",
            [
              createMockTeamPayload({
                uid: "user2",
                game_code: "nhl" as Leagues,
                start_date: now - 1000,
                team_key: "nhl.t.456",
              }),
            ],
          ],
        ]);

        const enqueuedTasks = [{ uid: "user1" }, { uid: "user2" }];

        const testLayer = Layer.mergeAll(
          Layer.succeed(TimeService, {
            getCurrentPacificHour: () => 10,
          }),
          Layer.succeed(SchedulingService, {
            getScheduleInfo: () =>
              Effect.succeed(
                createMockScheduleInfo({
                  leagues: [
                    { league: "nba" as Leagues, hasGamesToday: true, hasGameNextHour: false },
                    { league: "nhl" as Leagues, hasGamesToday: true, hasGameNextHour: false },
                  ],
                  leaguesWithGamesToday: ["nba", "nhl"] as readonly Leagues[],
                }),
              ),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => Effect.succeed(activeUsers),
            enqueueUsersTeams: () => Effect.succeed(enqueuedTasks),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () =>
              Promise.resolve(
                createMockTeamsSnapshot([
                  {
                    id: "nba.t.123",
                    data: createMockTeamPayload({
                      uid: "user1",
                      game_code: "nba" as Leagues,
                      start_date: now - 1000,
                    }),
                  },
                  {
                    id: "nhl.t.456",
                    data: createMockTeamPayload({
                      uid: "user2",
                      game_code: "nhl" as Leagues,
                      start_date: now - 1000,
                    }),
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
            skipGamesCheck: false,
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
            getScheduleInfo: () =>
              Effect.succeed(
                createMockScheduleInfo({
                  leagues: [
                    { league: "nba" as Leagues, hasGamesToday: true, hasGameNextHour: false },
                  ],
                  leaguesWithGamesToday: ["nba"] as readonly Leagues[],
                }),
              ),
            setTodaysPostponedTeams: () => Effect.void,
            setStartingPlayersForToday: () => Effect.void,
            mapUsersToActiveTeams: () => Effect.succeed(new Map()),
            enqueueUsersTeams: () => Effect.succeed([]),
          }),
          Layer.succeed(FirestoreService, {
            getActiveTeamsForLeagues: () => Promise.resolve(createMockTeamsSnapshot([])),
          }),
        );

        // Act
        const result = yield* dispatchService
          .dispatchSetLineup({
            userId: "test-user",
            teamKey: "test.t.123",
            lineupChanges: [],
            skipGamesCheck: false,
          })
          .pipe(Effect.provide(testLayer));

        // Assert
        expect(result.success).toBe(true);
        expect(result.taskCount).toBe(0);
        expect(result.message).toContain("No eligible");
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
