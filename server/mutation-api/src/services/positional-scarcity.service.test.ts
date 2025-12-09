import type { CommonTeam } from "@common/types/team.js";
import type { Mock } from "vitest";

import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeagueSpecificScarcityOffsets } from "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js";

import * as coreScarcity from "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js";
import {
  getScarcityOffsetsForTeam,
  recalculateScarcityOffsetsForAll,
} from "./positional-scarcity.service.js";

vi.mock("../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js", () => ({
  getScarcityOffsetsForTeam: vi.fn(),
  recalculateScarcityOffsetsForAll: vi.fn(),
}));

const mockCoreGetScarcityOffsetsForTeam = coreScarcity.getScarcityOffsetsForTeam as Mock;
const mockCoreRecalculateScarcityOffsetsForAll =
  coreScarcity.recalculateScarcityOffsetsForAll as Mock;

describe("PositionalScarcityService", () => {
  let mockTeam: CommonTeam;
  const mockScarcityOffsets: LeagueSpecificScarcityOffsets = {
    C: 0.1,
    "1B": 0.2,
    "2B": 0.15,
    "3B": 0.18,
    SS: 0.22,
    OF: 0.05,
    SP: 0.12,
    RP: 0.08,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
    } as CommonTeam;
  });

  describe("getScarcityOffsetsForTeam", () => {
    it("returns scarcity offsets for a valid team", async () => {
      // Arrange
      mockCoreGetScarcityOffsetsForTeam.mockResolvedValue(mockScarcityOffsets);

      // Act
      const result = await Effect.runPromise(getScarcityOffsetsForTeam(mockTeam));

      // Assert
      expect(result).toEqual(mockScarcityOffsets);
      expect(mockCoreGetScarcityOffsetsForTeam).toHaveBeenCalledWith(mockTeam);
    });

    it("returns PositionalScarcityError when core function throws", async () => {
      // Arrange
      mockCoreGetScarcityOffsetsForTeam.mockRejectedValue(new Error("API connection failed"));

      // Act
      const result = await Effect.runPromise(Effect.flip(getScarcityOffsetsForTeam(mockTeam)));

      // Assert
      expect(result).toBeDefined();
      expect(result._tag).toBe("PositionalScarcityError");
      expect(result.message).toBe("Failed to get scarcity offsets for team");
      expect(result.error).toBeDefined();
    });
  });

  describe("recalculateScarcityOffsetsForAll", () => {
    it("recalculates scarcity offsets for all leagues", async () => {
      // Arrange
      mockCoreRecalculateScarcityOffsetsForAll.mockResolvedValue(undefined);

      // Act
      const result = await Effect.runPromise(recalculateScarcityOffsetsForAll());

      // Assert
      expect(result).toBeUndefined();
      expect(mockCoreRecalculateScarcityOffsetsForAll).toHaveBeenCalled();
    });

    it("returns PositionalScarcityError when core function throws", async () => {
      // Arrange
      mockCoreRecalculateScarcityOffsetsForAll.mockRejectedValue(new Error("Database unavailable"));

      // Act
      const result = await Effect.runPromise(Effect.flip(recalculateScarcityOffsetsForAll()));

      // Assert
      expect(result).toBeDefined();
      expect(result._tag).toBe("PositionalScarcityError");
      expect(result.message).toBe("Failed to recalculate scarcity offsets for all");
      expect(result.error).toBeDefined();
    });
  });
});
