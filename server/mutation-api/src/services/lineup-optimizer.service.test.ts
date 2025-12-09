import type { TeamOptimizer } from "@common/types/team.js";

import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { createLineupOptimizer, type LineupOptimizer } from "./lineup-optimizer.service.js";

describe("LineupOptimizer", () => {
  let mockTeam: TeamOptimizer;
  let lineupOptimizer: LineupOptimizer;

  beforeEach(() => {
    mockTeam = {
      team_key: "test.team.1",
      game_code: "mlb",
      start_date: Date.now() - 86400000,
      end_date: Date.now() + 86400000 * 180,
      weekly_deadline: "",
      roster_positions: {
        C: 1,
        "1B": 1,
        "2B": 1,
        "3B": 1,
        SS: 1,
        OF: 3,
        SP: 5,
        RP: 2,
        BN: 5,
        IL: 2,
      },
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
      automated_transaction_processing: true,
      lineup_paused_at: -1,
    };

    const result = Effect.runSync(createLineupOptimizer(mockTeam));
    lineupOptimizer = result;
  });

  describe("optimizeStartingLineup", () => {
    it("should optimize starting lineup successfully", async () => {
      const result = await Effect.runPromise(lineupOptimizer.optimizeStartingLineup());

      expect(result).toBeUndefined();
    });

    it("handles optimization errors from invalid team data", async () => {
      // Arrange
      const invalidTeam = {
        ...mockTeam,
        players: undefined,
      } as unknown as TeamOptimizer;

      // Act
      const result = await Effect.runPromise(
        Effect.either(
          Effect.flatMap(createLineupOptimizer(invalidTeam), (optimizer) =>
            optimizer.optimizeStartingLineup(),
          ),
        ),
      );

      // Assert
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("LineupOptimizerError");
      }
    });
  });

  describe("lineupChanges", () => {
    it("should return null when no changes made", async () => {
      const result = await Effect.runPromise(lineupOptimizer.lineupChanges);

      expect(result).toBeNull();
    });
  });

  describe("playerTransactions", () => {
    it("should return null when no transactions generated", async () => {
      const result = await Effect.runPromise(lineupOptimizer.playerTransactions);

      expect(result).toBeNull();
    });
  });

  describe("shouldPostLineupChanges", () => {
    it("should return false when no changes needed", async () => {
      const result = await Effect.runPromise(lineupOptimizer.shouldPostLineupChanges());

      expect(result).toBe(false);
    });
  });

  describe("setAddCandidates", () => {
    it("should set add candidates successfully", async () => {
      const mockCandidates = [
        {
          player_key: "test.player.1",
          player_name: "Test Player",
          eligible_positions: ["1B", "OF"],
          display_positions: ["1B"],
          selected_position: null,
          is_editable: true,
          is_playing: true,
          injury_status: "Healthy",
          percent_started: 75,
          percent_owned: 50,
          percent_owned_delta: 5,
          is_starting: 1,
          is_undroppable: false,
          ranks: {
            last30Days: 100,
            last14Days: 95,
            next7Days: 90,
            restOfSeason: 85,
            last4Weeks: 88,
            projectedWeek: 92,
            next4Weeks: 87,
          },
          ownership: {
            ownership_type: "freeagents" as const,
          },
        },
      ];

      const result = await Effect.runPromise(lineupOptimizer.setAddCandidates(mockCandidates));

      expect(result).toBeUndefined();
    });
  });

  describe("getCurrentTeamState", () => {
    it("should return current team state", async () => {
      const result = await Effect.runPromise(lineupOptimizer.getCurrentTeamState());

      expect(result).toBeDefined();
      expect(result.team_key).toBe(mockTeam.team_key);
    });
  });

  describe("isSuccessfullyOptimized", () => {
    it("should check optimization status", async () => {
      const result = await Effect.runPromise(lineupOptimizer.isSuccessfullyOptimized());

      expect(typeof result).toBe("boolean");
    });
  });

  describe("generateDropPlayerTransactions", () => {
    it("should generate drop transactions", async () => {
      const result = await Effect.runPromise(lineupOptimizer.generateDropPlayerTransactions());

      expect(result).toBeUndefined();
    });
  });

  describe("generateAddPlayerTransactions", () => {
    it("should generate add transactions", async () => {
      const result = await Effect.runPromise(lineupOptimizer.generateAddPlayerTransactions());

      expect(result).toBeUndefined();
    });
  });

  describe("generateSwapPlayerTransactions", () => {
    it("should generate swap transactions", async () => {
      const result = await Effect.runPromise(lineupOptimizer.generateSwapPlayerTransactions());

      expect(result).toBeUndefined();
    });
  });
});
