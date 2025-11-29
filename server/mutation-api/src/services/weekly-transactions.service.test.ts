import type { Mock } from "vitest";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirestoreTeam } from "@common/types/team.js";

// Only mock external dependencies, not local scheduling service
vi.mock("../../../core/src/common/services/firebase/firestore.service.js", () => ({
  getTomorrowsActiveWeeklyTeams: vi.fn(),
}));

vi.mock("../../../core/src/transactions/services/processTransactions.service.js", () => ({
  getTopAvailablePlayers: vi.fn(),
}));

vi.mock("./set-lineup.service.js", () => ({
  processTomorrowsTransactions: vi.fn(() => Effect.void),
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

// Import after mocking - these are now properly mocked
import * as coreTransactions from "../../../core/src/transactions/services/processTransactions.service.js";
import * as setLineupService from "./set-lineup.service.js";
import {
  performWeeklyLeagueTransactions,
  WeeklyTransactionsError,
} from "./weekly-transactions.service.js";

const mockGetTopAvailablePlayers = coreTransactions.getTopAvailablePlayers as Mock;
const mockProcessTomorrowsTransactions = setLineupService.processTomorrowsTransactions as Mock;

function createMockFirestoreTeam(overrides: Partial<FirestoreTeam> = {}): FirestoreTeam {
  return {
    team_key: "123.l.456.t.1",
    game_code: "mlb",
    start_date: Date.now() - 86400000,
    end_date: Date.now() + 86400000 * 180,
    weekly_deadline: "4",
    roster_positions: { C: 1, "1B": 1, BN: 3 },
    num_teams: 12,
    uid: "test-user-123",
    is_subscribed: true,
    is_setting_lineups: true,
    allow_transactions: true,
    allow_dropping: true,
    allow_adding: true,
    allow_add_drops: true,
    allow_waiver_adds: true,
    automated_transaction_processing: false,
    last_updated: Date.now(),
    lineup_paused_at: -1,
    ...overrides,
  };
}

describe("WeeklyTransactionsError", () => {
  it("creates error with message only", () => {
    // Arrange
    const message = "Something went wrong";

    // Act
    const error = new WeeklyTransactionsError({ message });

    // Assert
    expect(error.message).toBe(message);
    expect(error._tag).toBe("WeeklyTransactionsError");
  });

  it("creates error with message and uid", () => {
    // Arrange
    const message = "User-specific error";
    const uid = "test-user-123";

    // Act
    const error = new WeeklyTransactionsError({ message, uid });

    // Assert
    expect(error.message).toBe(message);
  });
});

describe("performWeeklyLeagueTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when firestoreTeams is empty", async () => {
    // Arrange
    const uid = "test-user-123";
    const firestoreTeams: FirestoreTeam[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    // Act
    const result = await Effect.runPromiseExit(
      performWeeklyLeagueTransactions(uid, firestoreTeams),
    );

    // Assert
    expect(Exit.isSuccess(result)).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(`No weekly teams for user ${uid}`);
    expect(mockGetTopAvailablePlayers).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("fails when uid is empty", async () => {
    // Arrange
    const uid = "";
    const firestoreTeams = [createMockFirestoreTeam()];

    // Act
    const result = await Effect.runPromiseExit(
      performWeeklyLeagueTransactions(uid, firestoreTeams),
    );

    // Assert
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      const error = result.cause;
      expect(error._tag).toBe("Fail");
    }
  });

  it("processes teams with top available players", async () => {
    // Arrange
    const uid = "test-user-123";
    const firestoreTeams = [
      createMockFirestoreTeam({ team_key: "team-1" }),
      createMockFirestoreTeam({ team_key: "team-2" }),
    ];
    const mockTopPlayers = { "team-1": [], "team-2": [] };

    mockGetTopAvailablePlayers.mockResolvedValue(mockTopPlayers);
    mockProcessTomorrowsTransactions.mockReturnValue(Effect.void);

    // Act
    const result = await Effect.runPromiseExit(
      performWeeklyLeagueTransactions(uid, firestoreTeams),
    );

    // Assert
    expect(Exit.isSuccess(result)).toBe(true);
    expect(mockGetTopAvailablePlayers).toHaveBeenCalledWith(firestoreTeams, uid);
    expect(mockProcessTomorrowsTransactions).toHaveBeenCalledWith(
      firestoreTeams,
      firestoreTeams,
      uid,
      mockTopPlayers,
    );
  });

  it("fails when getTopAvailablePlayers throws", async () => {
    // Arrange
    const uid = "test-user-123";
    const firestoreTeams = [createMockFirestoreTeam()];

    mockGetTopAvailablePlayers.mockRejectedValue(new Error("Yahoo API error"));

    // Act
    const result = await Effect.runPromiseExit(
      performWeeklyLeagueTransactions(uid, firestoreTeams),
    );

    // Assert
    expect(Exit.isFailure(result)).toBe(true);
  });

  it("handles single team correctly", async () => {
    // Arrange
    const uid = "single-team-user";
    const firestoreTeams = [
      createMockFirestoreTeam({
        team_key: "single-team",
        weekly_deadline: "5",
      }),
    ];
    const mockTopPlayers = { "single-team": [] };

    mockGetTopAvailablePlayers.mockResolvedValue(mockTopPlayers);
    mockProcessTomorrowsTransactions.mockReturnValue(Effect.void);

    // Act
    const result = await Effect.runPromiseExit(
      performWeeklyLeagueTransactions(uid, firestoreTeams),
    );

    // Assert
    expect(Exit.isSuccess(result)).toBe(true);
    expect(mockGetTopAvailablePlayers).toHaveBeenCalledWith(firestoreTeams, uid);
  });
});
