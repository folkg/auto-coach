import type { PlayerRanks } from "@common/types/Player.js";

import type { LeagueSpecificScarcityOffsets } from "../../../calcPositionalScarcity/services/positionalScarcity.service.js";
import type { Player } from "../../classes/Player.js";

const OWNERSHIP_FACTOR = 0.5;
const OWNERSHIP_DELTA_ADJUSTMENT_BOUND = 4;
const RANK_WEIGHTS: Record<keyof PlayerRanks, number> = {
  // Applies to NHL, MLB, NBA only - totals 100
  last30Days: 40,
  last14Days: 30,
  next7Days: 10,
  restOfSeason: 20,
  // Applies to NFL only - totals 100
  last4Weeks: 40,
  projectedWeek: 35,
  next4Weeks: 25,
};

/**
 * Returns a score function to determine the ownership score of individual players
 *
 * @export
 * @param {number} numPlayersInLeague - The number of players in the league
 * @param {LeagueSpecificScarcityOffsets} positionalScarcityOffsets - The offset to apply to each position based on it's scarcity in the league settings
 * @return {()} - Returns a function that takes a palyer and returns a score between 0 and 120
 */
export function ownershipScoreFunctionFactory(
  numPlayersInLeague: number,
  positionalScarcityOffsets?: LeagueSpecificScarcityOffsets,
): (player: Player) => number {
  return (player: Player) => {
    const positionalScarcityOffset = calculatePositionalScarcityOffset(
      player,
      positionalScarcityOffsets,
    );
    const ownershipScore = player.percent_owned - positionalScarcityOffset;
    const rankScore = calculateRankScore(numPlayersInLeague, player);
    const ownershipDeltaAdjustment = calculateOwnershipDelta(player);

    return (
      ownershipScore * OWNERSHIP_FACTOR +
      rankScore * (1 - OWNERSHIP_FACTOR) +
      ownershipDeltaAdjustment
    );
  };
}

export function calculatePositionalScarcityOffset(
  player: Player,
  positionalScarcityOffsets: LeagueSpecificScarcityOffsets | undefined,
) {
  if (!positionalScarcityOffsets) {
    return 0;
  }

  const eligibleOffsets = player.eligible_positions
    .filter((pos) => pos in positionalScarcityOffsets)
    .map((pos) => positionalScarcityOffsets[pos])
    .filter((offset): offset is number => offset !== undefined);

  return eligibleOffsets.length === 0 ? 0 : Math.min(...eligibleOffsets);
}

function calculateOwnershipDelta(player: Player): number {
  return Math.min(player.percent_owned_delta, OWNERSHIP_DELTA_ADJUSTMENT_BOUND);
}

function calculateRankScore(numPlayersInLeague: number, player: Player): number {
  const rankEntries = Object.entries(player.ranks) as [keyof PlayerRanks, number][];
  const scoreOutOfTwenty = rankEntries.reduce((acc, [rankType, rank]) => {
    const weight = RANK_WEIGHTS[rankType];
    if (rank === -1 || weight === undefined) {
      return acc;
    }
    return acc + Math.min(numPlayersInLeague / rank, weight / 5);
  }, 0);

  return 5 * scoreOutOfTwenty;
}
