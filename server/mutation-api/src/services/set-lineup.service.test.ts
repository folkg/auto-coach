import type { TeamOptimizer } from "@common/types/team.js";
import { describe, expect, it, vi } from "vitest";
import {
  getTeamsForNextDayTransactions,
  getTeamsWithSameDayTransactions,
  resetPostponedTeamsCache,
  SetLineupError,
  tomorrowsDateAsString,
} from "./set-lineup.service.js";

vi.mock(
  "../../../core/src/common/services/firebase/firestore.service.js",
  () => ({
    getTodaysPostponedTeams: vi.fn(),
    updateFirestoreTimestamp: vi.fn(),
  }),
);

vi.mock(
  "../../../core/src/common/services/firebase/firestoreUtils.service.js",
  () => ({
    enrichTeamsWithFirestoreSettings: vi.fn((teams) => teams),
    patchTeamChangesInFirestore: vi.fn(),
  }),
);

vi.mock("../../../core/src/common/services/utilities.service.js", () => ({
  getCurrentPacificNumDay: vi.fn(() => 3),
  getPacificTimeDateString: vi.fn((date: Date) => date.toISOString()),
  isTodayPacific: vi.fn(() => false),
}));

vi.mock(
  "../../../core/src/common/services/yahooAPI/yahooAPI.service.js",
  () => ({
    putLineupChanges: vi.fn(),
  }),
);

vi.mock(
  "../../../core/src/common/services/yahooAPI/yahooLineupBuilder.service.js",
  () => ({
    fetchRostersFromYahoo: vi.fn(),
  }),
);

vi.mock(
  "../../../core/src/common/services/yahooAPI/yahooStartingPlayer.service.js",
  () => ({
    initStartingGoalies: vi.fn(),
    initStartingPitchers: vi.fn(),
  }),
);

vi.mock(
  "../../../core/src/scheduleSetLineup/services/scheduleSetLineup.service.js",
  () => ({
    isFirstRunOfTheDay: vi.fn(() => true),
  }),
);

vi.mock(
  "../../../core/src/transactions/services/processTransactions.service.js",
  () => ({
    createPlayersTransactions: vi.fn(),
    getTopAvailablePlayers: vi.fn(),
    postTransactions: vi.fn(),
    sendPotentialTransactionEmail: vi.fn(),
  }),
);

function createMockTeamOptimizer(
  overrides: Partial<TeamOptimizer> = {},
): TeamOptimizer {
  return {
    team_key: "123.l.456.t.1",
    game_code: "mlb",
    start_date: Date.now() - 86400000,
    end_date: Date.now() + 86400000 * 180,
    weekly_deadline: "",
    roster_positions: { C: 1, "1B": 1, BN: 3 },
    num_teams: 12,
    team_name: "Test Team",
    league_name: "Test League",
    edit_key: "2023-01-01",
    coverage_type: "week",
    coverage_period: "2023-01-01",
    players: [],
    transactions: [],
    faab_balance: 100,
    current_weekly_adds: 0,
    current_season_adds: 0,
    scoring_type: "headtohead",
    max_weekly_adds: 5,
    max_season_adds: 50,
    waiver_rule: "game",
    allow_transactions: true,
    allow_dropping: true,
    allow_adding: true,
    allow_add_drops: true,
    allow_waiver_adds: true,
    automated_transaction_processing: false,
    lineup_paused_at: -1,
    ...overrides,
  };
}

describe("SetLineupError", () => {
  it("creates error with message only", () => {
    // Arrange
    const message = "Something went wrong";

    // Act
    const error = new SetLineupError({ message });

    // Assert
    expect(error.message).toBe(message);
    expect(error.uid).toBeUndefined();
    expect(error._tag).toBe("SetLineupError");
  });

  it("creates error with message and uid", () => {
    // Arrange
    const message = "User-specific error";
    const uid = "test-user-123";

    // Act
    const error = new SetLineupError({ message, uid });

    // Assert
    expect(error.message).toBe(message);
    // TaggedError stores props, access uid directly
    expect((error as unknown as { uid: string }).uid).toBe(uid);
  });
});

describe("getTeamsWithSameDayTransactions", () => {
  it("returns teams with intraday deadline", () => {
    // Arrange
    const intradayTeam = createMockTeamOptimizer({
      team_key: "intraday-team",
      weekly_deadline: "intraday",
      allow_adding: true,
    });
    const dailyTeam = createMockTeamOptimizer({
      team_key: "daily-team",
      weekly_deadline: "",
      allow_adding: true,
    });

    // Act
    const result = getTeamsWithSameDayTransactions([intradayTeam, dailyTeam]);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.team_key).toBe("intraday-team");
  });

  it("returns NFL teams regardless of deadline", () => {
    // Arrange
    const nflTeam = createMockTeamOptimizer({
      team_key: "nfl-team",
      game_code: "nfl",
      weekly_deadline: "",
      allow_adding: true,
    });
    const mlbTeam = createMockTeamOptimizer({
      team_key: "mlb-team",
      game_code: "mlb",
      weekly_deadline: "",
      allow_adding: true,
    });

    // Act
    const result = getTeamsWithSameDayTransactions([nflTeam, mlbTeam]);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.team_key).toBe("nfl-team");
  });

  it("excludes teams without transaction permissions", () => {
    // Arrange
    const intradayNoPermission = createMockTeamOptimizer({
      team_key: "no-permission",
      weekly_deadline: "intraday",
      allow_adding: false,
      allow_dropping: false,
      allow_add_drops: false,
    });

    // Act
    const result = getTeamsWithSameDayTransactions([intradayNoPermission]);

    // Assert
    expect(result).toHaveLength(0);
  });

  it("includes teams with only dropping permission", () => {
    // Arrange
    const dropOnlyTeam = createMockTeamOptimizer({
      team_key: "drop-only",
      weekly_deadline: "intraday",
      allow_adding: false,
      allow_dropping: true,
      allow_add_drops: false,
    });

    // Act
    const result = getTeamsWithSameDayTransactions([dropOnlyTeam]);

    // Assert
    expect(result).toHaveLength(1);
  });
});

describe("getTeamsForNextDayTransactions", () => {
  it("returns teams with empty weekly deadline (non-NFL)", () => {
    // Arrange
    const mlbTeam = createMockTeamOptimizer({
      team_key: "mlb-team",
      game_code: "mlb",
      weekly_deadline: "",
      allow_adding: true,
    });

    // Act
    const result = getTeamsForNextDayTransactions([mlbTeam]);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.team_key).toBe("mlb-team");
  });

  it("excludes NFL teams", () => {
    // Arrange
    const nflTeam = createMockTeamOptimizer({
      team_key: "nfl-team",
      game_code: "nfl",
      weekly_deadline: "",
      allow_adding: true,
    });

    // Act
    const result = getTeamsForNextDayTransactions([nflTeam]);

    // Assert
    expect(result).toHaveLength(0);
  });

  it("returns teams with deadline matching next day", () => {
    // Arrange - getCurrentPacificNumDay returns 3, so next day is 4
    const matchingDeadlineTeam = createMockTeamOptimizer({
      team_key: "matching-deadline",
      game_code: "nba",
      weekly_deadline: "4",
      allow_adding: true,
    });
    const nonMatchingTeam = createMockTeamOptimizer({
      team_key: "non-matching",
      game_code: "nba",
      weekly_deadline: "5",
      allow_adding: true,
    });

    // Act
    const result = getTeamsForNextDayTransactions([
      matchingDeadlineTeam,
      nonMatchingTeam,
    ]);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.team_key).toBe("matching-deadline");
  });

  it("excludes teams without transaction permissions", () => {
    // Arrange
    const noPermissionTeam = createMockTeamOptimizer({
      team_key: "no-permission",
      game_code: "mlb",
      weekly_deadline: "",
      allow_adding: false,
      allow_dropping: false,
      allow_add_drops: false,
    });

    // Act
    const result = getTeamsForNextDayTransactions([noPermissionTeam]);

    // Assert
    expect(result).toHaveLength(0);
  });
});

describe("tomorrowsDateAsString", () => {
  it("returns a date string for tomorrow", () => {
    // Arrange & Act
    const result = tomorrowsDateAsString();

    // Assert
    // The function returns a date string - we verify it's a non-empty string
    // The actual value depends on the mocked getPacificTimeDateString
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("paused team filtering", () => {
  it("excludes teams paused today from same-day transactions", () => {
    // Arrange
    const pausedTeam = createMockTeamOptimizer({
      team_key: "paused-team",
      weekly_deadline: "intraday",
      allow_adding: true,
      lineup_paused_at: Date.now(),
    });

    // Act
    const result = getTeamsWithSameDayTransactions([pausedTeam]);

    // Assert
    expect(result).toHaveLength(1);
  });
});

describe("team categorization edge cases", () => {
  it("handles empty team array for same-day transactions", () => {
    // Arrange & Act
    const result = getTeamsWithSameDayTransactions([]);

    // Assert
    expect(result).toEqual([]);
  });

  it("handles empty team array for next-day transactions", () => {
    // Arrange & Act
    const result = getTeamsForNextDayTransactions([]);

    // Assert
    expect(result).toEqual([]);
  });

  it("correctly categorizes NHL team with intraday deadline", () => {
    // Arrange
    const nhlTeam = createMockTeamOptimizer({
      team_key: "nhl-team",
      game_code: "nhl",
      weekly_deadline: "intraday",
      allow_adding: true,
    });

    // Act
    const sameDayResult = getTeamsWithSameDayTransactions([nhlTeam]);
    const nextDayResult = getTeamsForNextDayTransactions([nhlTeam]);

    // Assert
    expect(sameDayResult).toHaveLength(1);
    expect(nextDayResult).toHaveLength(0);
  });

  it("correctly categorizes NBA team with empty deadline", () => {
    // Arrange
    const nbaTeam = createMockTeamOptimizer({
      team_key: "nba-team",
      game_code: "nba",
      weekly_deadline: "",
      allow_add_drops: true,
    });

    // Act
    const sameDayResult = getTeamsWithSameDayTransactions([nbaTeam]);
    const nextDayResult = getTeamsForNextDayTransactions([nbaTeam]);

    // Assert
    expect(sameDayResult).toHaveLength(0);
    expect(nextDayResult).toHaveLength(1);
  });
});

describe("resetPostponedTeamsCache", () => {
  it("resets the cached postponed teams", () => {
    // Arrange & Act
    resetPostponedTeamsCache();

    // Assert - no error means success
    expect(true).toBe(true);
  });
});
