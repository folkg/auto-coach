/**
 * Integration tests for PositionalScarcityService.
 *
 * These tests verify the positional scarcity calculation flows.
 */

import { Effect } from "effect";
import { vi } from "vitest";
import type { CommonTeam } from "@common/types/team.js";
import { describe, expect, it } from "@effect/vitest";

// Create hoisted mocks to avoid initialization order issues
const mocks = vi.hoisted(() => ({
  getScarcityOffsetsForTeam: vi.fn().mockResolvedValue({
    C: 0.5,
    LW: 0.3,
    RW: 0.4,
    D: 0.2,
    G: 0.1,
  }),
  recalculateScarcityOffsetsForAll: vi.fn().mockResolvedValue(undefined),
}));

// Mock the core positional scarcity service
vi.mock(
  "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js",
  () => mocks,
);

// Import after mocking
import {
  getScarcityOffsetsForTeam,
  recalculateScarcityOffsetsForAll,
} from "./positional-scarcity.service.js";

describe("PositionalScarcityService Integration Tests", () => {
  describe("getScarcityOffsetsForTeam", () => {
    it("retrieves scarcity offsets for a team successfully", () =>
      Effect.gen(function* () {
        // Arrange
        const mockTeam: CommonTeam = {
          team_key: "nhl.l.12345.t.1",
          game_code: "nhl",
          start_date: Date.now() - 86400000,
          end_date: Date.now() + 86400000 * 30,
          weekly_deadline: "intraday",
          roster_positions: { C: 2, LW: 2, RW: 2, D: 4, G: 2 },
          num_teams: 12,
        };

        // Act
        const result = yield* getScarcityOffsetsForTeam(mockTeam);

        // Assert
        expect(result).toBeDefined();
        expect(typeof result.C).toBe("number");
      }));

    it("propagates errors from core service", () =>
      Effect.gen(function* () {
        // Arrange
        mocks.getScarcityOffsetsForTeam.mockRejectedValueOnce(new Error("Core service error"));

        const mockTeam: CommonTeam = {
          team_key: "nhl.l.12345.t.1",
          game_code: "nhl",
          start_date: Date.now() - 86400000,
          end_date: Date.now() + 86400000 * 30,
          weekly_deadline: "intraday",
          roster_positions: { C: 2 },
          num_teams: 12,
        };

        // Act
        const result = yield* Effect.either(getScarcityOffsetsForTeam(mockTeam));

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("PositionalScarcityError");
        }
      }));
  });

  describe("recalculateScarcityOffsetsForAll", () => {
    it("recalculates scarcity offsets for all leagues successfully", () =>
      Effect.gen(function* () {
        // Act
        yield* recalculateScarcityOffsetsForAll();

        // Assert - should complete without error
        expect(true).toBe(true);
      }));

    it("propagates errors from core service", () =>
      Effect.gen(function* () {
        // Arrange
        mocks.recalculateScarcityOffsetsForAll.mockRejectedValueOnce(
          new Error("Recalculation failed"),
        );

        // Act
        const result = yield* Effect.either(recalculateScarcityOffsetsForAll());

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("PositionalScarcityError");
          expect(result.left.message).toContain("Recalculation failed");
        }
      }));
  });
});
