import assert from "node:assert";
import type { GamesPlayed, InningsPitched } from "@common/types/team.js";
import type { Player } from "../../classes/Player.js";
import { HEALTHY_STATUS_LIST } from "../../helpers/constants.js";
import {
  getMLBStartingPitchers,
  getNHLStartingGoalies,
} from "../yahooAPI/yahooStartingPlayer.service.js";

const NOT_PLAYING_FACTOR = 1e-7; // 0.0000001
const INJURY_FACTOR = 1e-3; // 0.001
const NOT_STARTING_FACTOR = 1e-2; // 0.01
const LTIR_FACTOR = 1e-1; // 0.1 // extra penalty on top of INJURY_FACTOR
const STARTING_FACTOR = 100;

type FactoryArgs = {
  gameCode: string;
  weeklyDeadline: string;
  seasonTimeProgress: number;
  ownershipScoreFunction: (player: Player) => number;
  gamesPlayed?: GamesPlayed[];
  inningsPitched?: InningsPitched;
};
/**
 * Returns the proper score function used to compare players on the same
 * fantasy roster in order to decide who to start and who to sit.
 *
 * @export
 * @async
 * @param {FactoryArgs} args - The arguments to the factory function
 * @return {()} - A function that takes a player and returns a score.
 */
export function playerStartScoreFunctionFactory(args: FactoryArgs) {
  const { gameCode, weeklyDeadline, gamesPlayed } = args;
  if (gamesPlayed) {
    return scoreFunctionMaxGamesPlayed(
      args.seasonTimeProgress,
      args.ownershipScoreFunction,
      gamesPlayed,
      args.inningsPitched,
    );
  }
  if (gameCode === "nfl") {
    return scoreFunctionNFL();
  }
  if (weeklyDeadline && weeklyDeadline !== "intraday") {
    // weeklyDeadline will be something like "1" to represent Monday
    return scoreFunctionWeeklyLineup();
  }
  if (gameCode === "nhl") {
    return scoreFunctionNHL();
  }
  if (gameCode === "mlb") {
    return scoreFunctionMLB();
  }
  return scoreFunctionNBA();
}

/**
 * Returns a score function for leagues with a Maximum Games Played limit.
 *
 * @export
 * @param {number} seasonTimeProgress - The season time progress as a decimal between 0 and 1
 * @param {()} ownershipScoreFunction - The ownershipScoreFunction to be used for the player
 * @param {GamesPlayed[]} gamesPlayed - The maximum games played object for the Team
 * @param {?InningsPitched} [inningsPitched] - The maximum innings pitched object for the Team
 * @return {()} - A function that takes a player and returns a score.
 */
export function scoreFunctionMaxGamesPlayed(
  seasonTimeProgress: number,
  ownershipScoreFunction: (player: Player) => number,
  gamesPlayed: GamesPlayed[],
  inningsPitched?: InningsPitched,
): (player: Player) => number {
  // if projected games played is less than churnThreshold, then churn players more freely
  // churnThreshold will be between 0.9 and 1.0 depending on the season time progress
  const churnThreshold = 0.9 + Math.min(seasonTimeProgress * 0.09, 0.09);
  return (player: Player) => {
    assert(
      gamesPlayed !== undefined,
      "gamesPlayed should never be undefined if scoreFunctionMaxGamesPlayed() is called",
    );

    const paceKeeper = getPaceKeeper(player);
    const currentPace = paceKeeper ? paceKeeper.projected / paceKeeper.max : 1; // in case there is an issue with the yahoo data

    let score = ownershipScoreFunction(player);
    score = applyInjuryScoreFactors(score, player);
    if (currentPace > churnThreshold) {
      if (!player.isInactiveListEligible()) {
        score += getScoreBoost(player, currentPace);
      }
    } else {
      score *= getScorePenaltyFactor(player);
    }

    return score;
  };

  function getPaceKeeper(player: Player) {
    const isPitcher =
      inningsPitched &&
      player.eligible_positions.some((pos) => ["P", "SP", "RP"].includes(pos));
    if (isPitcher) {
      return inningsPitched;
    }

    let gp = gamesPlayed.find((gp) => player.selected_position === gp.position);
    if (!gp) {
      // if the player's selected position is "BN" or IL and does not match a gp, use their minimum eligible position
      // really only used to determine if a player's position current pace is above or below the churn threshold
      gp = gamesPlayed
        .filter((gp) => player.eligible_positions.includes(gp.position))
        .reduce(
          (prev, curr) => {
            if (
              curr.games_played.projected / curr.games_played.max <
              prev.games_played.projected / prev.games_played.max
            ) {
              return curr;
            }
            return prev;
          },
          {
            position: "null",
            games_played: {
              played: 0,
              projected: Number.POSITIVE_INFINITY,
              max: 1,
            },
          },
        );
    }

    return gp?.games_played;
  }

  /**
   * Returns a score boost based on the player's current pace toward
   * the max games played / max innings pitched for that position.
   *
   * This is intended to make it harder to replace players that are currently
   * in the lineup, but allow for easier replacement as the pace towards the
   * max slows down.
   *
   * @param {Player} player - The player to get a score boost for
   * @param {number} currentPace - The player's position's current pace towards the max
   * @return {number} - a score boost between 0 and 10
   */
  function getScoreBoost(player: Player, currentPace: number): number {
    if (player.isReservePlayer()) {
      return 0;
    }

    return ((currentPace - churnThreshold) / (1 - churnThreshold)) * 10;
  }

  /**
   * Returns a score penalty factor based on whether or not the player has a game today.
   *
   * This is intended to introduce more churn by swapping in players with games more regularly.
   *
   * @param {Player} player - The player to get a score penalty factor for
   * @return {number} - a score penalty factor between 0 and 1
   */
  function getScorePenaltyFactor(player: Player): number {
    return !player.is_playing || player.is_starting === 0
      ? NOT_PLAYING_FACTOR
      : 1;
  }
}

/**
 * Default score function used to compare players. Basically just NBA at this point.
 * Higher scores are better.
 *
 * @return {()} - A function that takes a player and returns a score.
 *  returns a score.
 */
export function scoreFunctionNBA(): (player: Player) => number {
  return (player: Player) => {
    const score = getInitialScore(player);
    return applyScoreFactors(score, player);
  };
}
/**
 * Score function used to compare players in NHL leagues.
 * Higher scores are better.
 *
 * @return {()} - A function that takes a player and returns a score.
 *  returns a score.
 */
export function scoreFunctionNHL(): (player: Player) => number {
  const startingGoalies = getNHLStartingGoalies() ?? [];
  return (player: Player) => {
    const isStartingGoalie = player.eligible_positions.includes("G")
      ? isStartingPlayer(player, startingGoalies)
      : false;

    const score = getInitialScore(player);
    return applyScoreFactors(score, player, isStartingGoalie);
  };
}

/**
 * Score function used to compare players in NHL leagues.
 * Higher scores are better.
 *
 * @return {()} - A function that takes a player and returns a score.
 *  returns a score.
 */
export function scoreFunctionMLB(): (player: Player) => number {
  const startingPitchers = getMLBStartingPitchers() ?? [];
  return (player: Player) => {
    // TODO: Do we need to boost the score for starting pitchers? Or is it superfluous?
    // Boost the score for starting pitchers since they only get starting_status === 1.
    // Penalize the non-starting SP pitchers so they don't start over an RP that is playing.

    // Penalize non-starting batters if their starting_score === 0 instead, however,
    // since there are often late confirmations and we don't want to leave a good
    // unconfirmed player on the bench in favour of a bad confirmed starter.

    const isStartingPitcher =
      player.eligible_positions.some((pos) =>
        ["P", "SP", "RP"].includes(pos),
      ) && isStartingPlayer(player, startingPitchers);

    const isNonStartingSP =
      player.eligible_positions.includes("SP") &&
      !player.eligible_positions.includes("RP") &&
      !isStartingPitcher;

    let score = getInitialScore(player);
    if (player.is_starting === 0 || isNonStartingSP || player.isLTIR()) {
      score *= NOT_STARTING_FACTOR;
    }
    return applyScoreFactors(score, player, isStartingPitcher);
  };
}

/**
 * Score function used to compare players in NFL leagues.
 * Higher scores are better.
 *
 * @return {()} - A function that takes a player and returns a score.
 */
export function scoreFunctionNFL(): (player: Player) => number {
  return (player: Player) => {
    // TODO: Does rank_projected_week factor in injury status already? We might be double counting, but does it matter?
    const score = (getInitialScore(player) / player.ranks.projectedWeek) * 100;
    return applyScoreFactors(score, player);
  };
}
/**
 * Score function used to compare players in leagues that need their lineups
 * set weekly.
 * Higher scores are better.
 *
 * @return {()} - A function that takes a player and returns a score.
 */
export function scoreFunctionWeeklyLineup(): (player: Player) => number {
  return (player: Player) => {
    // The score will be the inverse of their projected rank for the next week
    // We will not factor in injury status as Yahoo has already accounted for it
    return 100 / player.ranks.next7Days;
  };
}

function getInitialScore(player: Player): number {
  // The base score will be percent_started
  // percent_started has been broken before, so percent owned is a backup
  // Also make sure we return at least 1 to prevent issues with subsequent factors
  return (player.percent_started ?? player.percent_owned) || 1;
}

function applyScoreFactors(
  score: number,
  player: Player,
  isStartingPlayer = false,
): number {
  let result = applyInjuryScoreFactors(score, player);
  if (!player.is_playing) {
    result *= NOT_PLAYING_FACTOR;
  } else if (isStartingPlayer) {
    result *= STARTING_FACTOR;
  }
  return result;
}

function applyInjuryScoreFactors(score: number, player: Player): number {
  let result = score;

  const isPlayerInjured = !HEALTHY_STATUS_LIST.includes(player.injury_status);
  if (isPlayerInjured) {
    result *= INJURY_FACTOR;
    if (player.isLTIR()) {
      result *= LTIR_FACTOR;
    }
  }

  return result;
}

function isStartingPlayer(player: Player, starters: string[]): boolean {
  // starters array is not always accurate, so we need to check both
  return starters.includes(player.player_key) || player.is_starting === 1;
}
