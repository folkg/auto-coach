import type { Leagues } from "@common/types/Leagues.js";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import type {
  CalcPositionalScarcityRequest,
  SetLineupRequest,
  WeeklyTransactionsRequest,
} from "../types/api-schemas.js";

import {
  DispatchError,
  DispatchServiceImpl,
  FirestoreService,
  PositionalScarcityService,
  SchedulingService,
  TimeService,
  WeeklyTransactionsService,
} from "./dispatch.service.js";
import { PositionalScarcityError } from "./positional-scarcity.service.js";
import { type FirestoreTeamPayload, SchedulingError } from "./scheduling.service.js";
import { WeeklyTransactionsError } from "./weekly-transactions.service.js";

const mockSetLineupRequest: SetLineupRequest = {
  userId: "test-user",
  teamKey: "test.team.1",
  lineupChanges: [],
};

const mockWeeklyTransactionsRequest: WeeklyTransactionsRequest = {
  userId: "test-user",
  teamKey: "test.team.1",
  transactions: [],
};

const mockCalcPositionalScarcityRequest: CalcPositionalScarcityRequest = {
  userId: "test-user",
  leagueKey: "nba.l.123",
};

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
    last_updated: Date.now(),
    is_subscribed: true,
    is_setting_lineups: true,
    ...overrides,
  };
}

function createMockTeamsSnapshot(
  teams: ReadonlyArray<{ readonly id: string; readonly data: FirestoreTeamPayload }>,
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

function createTestTimeService(hour: number) {
  return Layer.succeed(TimeService, {
    getCurrentPacificHour: () => hour,
  });
}

function createTestSchedulingService(overrides: {
  readonly leagues?: readonly Leagues[];
  readonly leaguesError?: SchedulingError;
  readonly postponedTeamsError?: SchedulingError;
  readonly startingPlayersError?: SchedulingError;
  readonly activeUsers?: Map<string, FirestoreTeamPayload[]>;
  readonly enqueuedTasks?: readonly { readonly uid: string }[];
  readonly enqueueError?: SchedulingError;
}) {
  return Layer.succeed(SchedulingService, {
    leaguesToSetLineupsFor: () => {
      if (overrides.leaguesError) {
        return Effect.fail(overrides.leaguesError);
      }
      return Effect.succeed(overrides.leagues ?? []);
    },
    setTodaysPostponedTeams: (_leagues) => {
      if (overrides.postponedTeamsError) {
        return Effect.fail(overrides.postponedTeamsError);
      }
      return Effect.void;
    },
    setStartingPlayersForToday: (_teamsSnapshot) => {
      if (overrides.startingPlayersError) {
        return Effect.fail(overrides.startingPlayersError);
      }
      return Effect.void;
    },
    mapUsersToActiveTeams: (_teamsSnapshot) => {
      if (overrides.activeUsers) {
        return Effect.succeed(overrides.activeUsers);
      }
      // Default: one user with one team
      const defaultUsers = new Map<string, FirestoreTeamPayload[]>([
        [
          "user-1",
          [
            createMockTeamPayload({
              uid: "user-1",
              game_code: "nba" as Leagues,
              start_date: 0,
            }),
          ],
        ],
      ]);
      return Effect.succeed(defaultUsers);
    },
    enqueueUsersTeams: (_activeUsers, _queueName) => {
      if (overrides.enqueueError) {
        return Effect.fail(overrides.enqueueError);
      }
      return Effect.succeed(overrides.enqueuedTasks ?? [{ uid: "user-1" }]);
    },
  });
}

function createTestFirestoreService(overrides: {
  readonly teamsSnapshot?: QuerySnapshot<DocumentData>;
  readonly firestoreError?: Error;
}) {
  return Layer.succeed(FirestoreService, {
    getActiveTeamsForLeagues: (_leagues) => {
      if (overrides.firestoreError) {
        return Promise.reject(overrides.firestoreError);
      }
      return Promise.resolve(
        overrides.teamsSnapshot ??
          createMockTeamsSnapshot([
            {
              id: "team-1",
              data: createMockTeamPayload({
                uid: "user-1",
                game_code: "nba" as Leagues,
                start_date: Date.now() - 1000,
              }),
            },
          ]),
      );
    },
  });
}

function createTestWeeklyTransactionsService(overrides?: {
  readonly error?: WeeklyTransactionsError;
}) {
  return Layer.succeed(WeeklyTransactionsService, {
    scheduleWeeklyLeagueTransactions: () => {
      if (overrides?.error) {
        return Effect.fail(overrides.error);
      }
      return Effect.void;
    },
  });
}

function createTestPositionalScarcityService(overrides?: {
  readonly error?: PositionalScarcityError;
}) {
  return Layer.succeed(PositionalScarcityService, {
    recalculateScarcityOffsetsForAll: () => {
      if (overrides?.error) {
        return Effect.fail(overrides.error);
      }
      return Effect.void;
    },
  });
}

describe("DispatchServiceImpl.dispatchSetLineup", () => {
  const dispatchService = new DispatchServiceImpl();

  it.effect("skips dispatch at hour 0 (midnight run)", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(0);
      expect(result.message).toBe("Skipping midnight run (hour 0)");
    }).pipe(
      Effect.provide(createTestTimeService(0)),
      Effect.provide(createTestSchedulingService({})),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("dispatches at hour 1 (first run of day)", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(2);
    }).pipe(
      Effect.provide(createTestTimeService(1)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba", "nhl"],
          enqueuedTasks: [{ uid: "user-1" }, { uid: "user-2" }],
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("dispatches at any non-zero hour", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(2);
    }).pipe(
      Effect.provide(createTestTimeService(15)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba"],
          enqueuedTasks: [{ uid: "user-1" }, { uid: "user-2" }],
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("returns early when no leagues have games starting soon", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(0);
      expect(result.message).toBe("No leagues with games starting soon");
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(createTestSchedulingService({ leagues: [] })),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("returns early when no active users found", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(0);
      expect(result.message).toBe("No active users to set lineups for");
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba"],
          activeUsers: new Map(),
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("returns correct task count on success", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(3);
      expect(result.message).toContain("Successfully enqueued 3 set lineup tasks");
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba"],
          enqueuedTasks: [{ uid: "user-1" }, { uid: "user-2" }, { uid: "user-3" }],
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("includes league names in success message", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert
      expect(result.message).toContain("nba");
      expect(result.message).toContain("mlb");
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba", "mlb"],
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("fails when leaguesToSetLineupsFor fails", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* Effect.flip(dispatchService.dispatchSetLineup(mockSetLineupRequest));

      // Assert
      expect(result._tag).toBe("SchedulingError");
      expect(result.message).toBe("Failed to fetch schedule");
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(
        createTestSchedulingService({
          leaguesError: new SchedulingError({
            message: "Failed to fetch schedule",
          }),
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("fails when getActiveTeamsForLeagues fails", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* Effect.flip(dispatchService.dispatchSetLineup(mockSetLineupRequest));

      // Assert
      expect(result._tag).toBe("DispatchError");
      expect(result.message).toContain("Failed to fetch teams from Firebase");
      expect(result.message).toContain("Firestore connection failed");
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(createTestSchedulingService({ leagues: ["nba"] })),
      Effect.provide(
        createTestFirestoreService({
          firestoreError: new Error("Firestore connection failed"),
        }),
      ),
    ),
  );

  it.effect("fails when enqueueUsersTeams fails", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* Effect.flip(dispatchService.dispatchSetLineup(mockSetLineupRequest));

      // Assert
      expect(result._tag).toBe("SchedulingError");
      expect(result.message).toBe("Cloud Tasks API unavailable");
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba"],
          enqueueError: new SchedulingError({
            message: "Cloud Tasks API unavailable",
          }),
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("continues despite postponed teams failure (logged only)", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert - should still succeed because postponed teams failure is logged, not thrown
      expect(result.success).toBe(true);
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba"],
          postponedTeamsError: new SchedulingError({
            message: "Failed to fetch postponed teams",
          }),
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );

  it.effect("continues despite starting players failure (logged only)", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchSetLineup(mockSetLineupRequest);

      // Assert - should still succeed because starting players failure is logged, not thrown
      expect(result.success).toBe(true);
    }).pipe(
      Effect.provide(createTestTimeService(10)),
      Effect.provide(
        createTestSchedulingService({
          leagues: ["nba"],
          startingPlayersError: new SchedulingError({
            message: "Failed to fetch starting players",
          }),
        }),
      ),
      Effect.provide(createTestFirestoreService({})),
    ),
  );
});

describe("DispatchServiceImpl.dispatchWeeklyTransactions", () => {
  const dispatchService = new DispatchServiceImpl();

  it.effect("schedules weekly transactions successfully", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchWeeklyTransactions(
        mockWeeklyTransactionsRequest,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(0);
      expect(result.message).toBe("Weekly transactions scheduled successfully");
    }).pipe(Effect.provide(createTestWeeklyTransactionsService())),
  );

  it.effect("fails when scheduleWeeklyLeagueTransactions fails", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* Effect.flip(
        dispatchService.dispatchWeeklyTransactions(mockWeeklyTransactionsRequest),
      );

      // Assert
      expect(result._tag).toBe("WeeklyTransactionsError");
      expect(result.message).toBe("Failed to schedule");
    }).pipe(
      Effect.provide(
        createTestWeeklyTransactionsService({
          error: new WeeklyTransactionsError({ message: "Failed to schedule" }),
        }),
      ),
    ),
  );
});

describe("DispatchServiceImpl.dispatchCalcPositionalScarcity", () => {
  const dispatchService = new DispatchServiceImpl();

  it.effect("calculates positional scarcity successfully", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* dispatchService.dispatchCalcPositionalScarcity(
        mockCalcPositionalScarcityRequest,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(1);
      expect(result.message).toBe(
        "Positional scarcity calculation completed for league: nba.l.123",
      );
    }).pipe(Effect.provide(createTestPositionalScarcityService())),
  );

  it.effect("fails when recalculateScarcityOffsetsForAll fails", () =>
    Effect.gen(function* () {
      // Arrange & Act
      const result = yield* Effect.flip(
        dispatchService.dispatchCalcPositionalScarcity(mockCalcPositionalScarcityRequest),
      );

      // Assert
      expect(result._tag).toBe("PositionalScarcityError");
      expect(result.message).toBe("Calculation failed");
    }).pipe(
      Effect.provide(
        createTestPositionalScarcityService({
          error: new PositionalScarcityError({ message: "Calculation failed" }),
        }),
      ),
    ),
  );
});

describe("DispatchError", () => {
  it("creates error with message", () => {
    // Arrange & Act
    const error = new DispatchError({ message: "Something went wrong" });

    // Assert
    expect(error.message).toBe("Something went wrong");
    expect(error._tag).toBe("DispatchError");
  });
});
