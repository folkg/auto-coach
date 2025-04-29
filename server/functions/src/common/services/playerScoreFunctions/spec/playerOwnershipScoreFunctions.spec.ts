import { beforeEach, describe, expect, it } from "vitest";
import type { LeagueSpecificScarcityOffsets } from "../../../../calcPositionalScarcity/services/positionalScarcity.service";
import { calculatePositionalScarcityOffset } from "../../../../common/services/playerScoreFunctions/playerOwnershipScoreFunctions.service";
import type { Player } from "../../../classes/Player";

describe("playerOwnershipScoreFunctions", () => {
  describe("calculatePositionalScarcityOffset", () => {
    let positionalScarcityOffsets: LeagueSpecificScarcityOffsets;
    let player: Player;

    beforeEach(() => {
      player = {
        percent_owned: 75,
        percent_owned_delta: 0,
        ranks: {
          last30Days: -1,
          last14Days: -1,
          next7Days: -1,
          restOfSeason: -1,
          last4Weeks: 100,
          projectedWeek: 100,
          next4Weeks: 100,
        },
        eligible_positions: ["BN"],
      } as unknown as Player;

      positionalScarcityOffsets = {
        QB: 90,
        RB: 50,
        WR: 40,
        TE: 90,
      };
    });

    it("should not apply a positional scarcity offset if the player is not eligible at any position", () => {
      const resultA = calculatePositionalScarcityOffset(
        player,
        positionalScarcityOffsets,
      );
      expect(resultA).toEqual(0);
    });

    it("should apply the positional scarcity offset if the player is eligible at one position", () => {
      player.eligible_positions = ["RB", "BN"];
      const resultA = calculatePositionalScarcityOffset(
        player,
        positionalScarcityOffsets,
      );
      expect(resultA).toEqual(50);
    });

    it("should apply the lowest positional scarcity offset if the player is eligible at multiple positions", () => {
      player.eligible_positions = ["RB", "WR", "RB/WR/TE", "BN"];
      const resultA = calculatePositionalScarcityOffset(
        player,
        positionalScarcityOffsets,
      );
      expect(resultA).toEqual(40);
    });

    it("should NOT apply the positional scarcity offset if positionalScarcityOffsets is {}", () => {
      const resultA = calculatePositionalScarcityOffset(player, {});
      expect(resultA).toEqual(0);
    });

    it("should NOT apply the positional scarcity offset if positionalScarcityOffsets is undefined", () => {
      const resultA = calculatePositionalScarcityOffset(player, undefined);
      expect(resultA).toEqual(0);
    });
  });
});
