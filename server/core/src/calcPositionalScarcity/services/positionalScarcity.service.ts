import type { IPlayer } from "@common/types/Player.js";
import type { CommonTeam } from "@common/types/team.js";
import { logger } from "firebase-functions";
import {
  COMPOUND_POSITION_COMPOSITIONS,
  INACTIVE_POSITION_LIST,
  POSITIONAL_MAX_EXTRA_PLAYERS,
} from "../../common/helpers/constants.js";
import * as Firestore from "../../common/services/firebase/firestore.service.js";
import type { YahooAPIPlayerResponse } from "../../common/services/yahooAPI/interfaces/YahooAPIResponse.js";
import { getTopPlayersGeneral } from "../../common/services/yahooAPI/yahooAPI.service.js";
import buildPlayers from "../../common/services/yahooAPI/yahooPlayerProcessing.service.js";

export type ReplacementLevels = {
  [position: string]: number;
};
export type ScarcityOffsetsCollection = {
  [league: string]: {
    [position: string]: number[];
  };
};
export type LeagueSpecificScarcityOffsets = {
  [position: string]: number;
};

let SCARCITY_OFFSETS: ScarcityOffsetsCollection | null = null;

async function loadScarcityOffsets() {
  SCARCITY_OFFSETS = await Firestore.getPositionalScarcityOffsets();
}

export function clearScarcityOffsets() {
  SCARCITY_OFFSETS = null;
}

export async function getScarcityOffsetsForTeam(
  team: CommonTeam,
): Promise<LeagueSpecificScarcityOffsets> {
  const replacementLevels = getReplacementLevels(team);
  return await getLeagueSpecificScarcityOffsets(
    team.game_code,
    replacementLevels,
  );
}

export function getScarcityOffsetsForGame(gameCode: string) {
  return SCARCITY_OFFSETS?.[gameCode] ?? {};
}

export async function getLeagueSpecificScarcityOffsets(
  gameCode: string,
  replacementLevels: ReplacementLevels,
): Promise<LeagueSpecificScarcityOffsets> {
  if (!SCARCITY_OFFSETS) {
    await loadScarcityOffsets();
  }

  const result: Record<string, number> = {};

  for (const position in replacementLevels) {
    if (Object.hasOwn(replacementLevels, position)) {
      const replacementIndex = Math.max(
        Math.floor(replacementLevels[position] - 1),
        0,
      );

      let offset =
        getScarcityOffsetsForGame(gameCode)[position]?.[replacementIndex];

      if (offset === undefined) {
        await calculateOffsetForPosition(
          position,
          gameCode,
          replacementIndex + 1,
        );

        // Refresh the offsets
        offset =
          getScarcityOffsetsForGame(gameCode)[position]?.[replacementIndex];

        if (offset === undefined) {
          logger.error(
            `No offsets found for position ${position} and replacement level ${replacementIndex}. Returning empty object. No offsets will be applied to team.`,
          );
          logger.info("SCARCITY_OFFSETS:", SCARCITY_OFFSETS);
          logger.info("replacementLevels:", replacementLevels);
          return {};
        }
      }

      result[position] = offset;
    }
  }

  return result;
}

export async function recalculateScarcityOffsetsForAll() {
  const uid = await Firestore.getRandomUID();

  if (!SCARCITY_OFFSETS) {
    await loadScarcityOffsets();
  }

  const promises: Promise<void>[] = [];

  for (const league in SCARCITY_OFFSETS) {
    if (Object.hasOwn(SCARCITY_OFFSETS, league)) {
      const leagueScarcityOffsets = SCARCITY_OFFSETS[league];
      for (const position in leagueScarcityOffsets) {
        if (Object.hasOwn(leagueScarcityOffsets, position)) {
          // Don't await this, just let it run in the background
          const calcPromise = calculateOffsetForPosition(
            position,
            league,
            leagueScarcityOffsets[position].length,
            uid,
          );
          promises.push(calcPromise);
        }
      }
    }
  }

  // Wait for all the promises to resolve before exiting
  await Promise.allSettled(promises);
}

export async function calculateOffsetForPosition(
  position: string,
  league: string,
  count: number,
  uid?: string,
): Promise<void> {
  const localUid = uid ?? (await Firestore.getRandomUID());
  const promises = generateFetchPlayerPromises(
    localUid,
    position,
    league,
    count,
  );
  const players = await fetchYahooPlayers(promises);
  if (players) {
    updateOffsetArray(league, position, players);
  }
}

export function generateFetchPlayerPromises(
  uid: string,
  position: string,
  gameCode: string,
  count: number,
): Promise<YahooAPIPlayerResponse>[] {
  const result: Promise<YahooAPIPlayerResponse>[] = [];

  if (count < 1) {
    return result;
  }

  let i = 0;
  do {
    result.push(getTopPlayersGeneral(uid, gameCode, position, i * 25));
    i++;
  } while (i * 25 < count);

  return result;
}

async function fetchYahooPlayers(
  fetchPlayersPromises: Promise<YahooAPIPlayerResponse>[],
) {
  try {
    const yahooJSONs = await Promise.all(fetchPlayersPromises);
    const players: IPlayer[] = yahooJSONs
      .flatMap((yahooJSON) => {
        const gameJSON = yahooJSON.fantasy_content.games[0].game;
        const playersJSON = gameJSON[1];
        return buildPlayers(playersJSON);
      })
      .sort((a, b) => a.percent_owned - b.percent_owned);
    return players;
  } catch (e) {
    logger.error("Error in fetchPlayersFromYahoo:", e);
    return null;
  }
}

function updateOffsetArray(
  league: string,
  position: string,
  players: IPlayer[],
) {
  const array: number[] = [];
  for (const player of players) {
    array.push(player?.percent_owned ?? 0);
  }
  array.reverse();

  if (!SCARCITY_OFFSETS) {
    SCARCITY_OFFSETS = {};
  }
  if (!SCARCITY_OFFSETS[league]) {
    SCARCITY_OFFSETS[league] = {};
  }
  SCARCITY_OFFSETS[league][position] = array;
  Firestore.updatePositionalScarcityOffset(league, position, array);
}

export function getReplacementLevels(team: CommonTeam): ReplacementLevels {
  const {
    game_code: gameCode,
    roster_positions: rosterPositions,
    num_teams: numTeams,
  } = team;

  const compoundPositionCompositions = COMPOUND_POSITION_COMPOSITIONS[gameCode];
  const maxExtraPlayers = POSITIONAL_MAX_EXTRA_PLAYERS[gameCode];

  const result: Record<string, number> = {};

  const positionsList = Object.keys(rosterPositions).filter(
    (position) => INACTIVE_POSITION_LIST.includes(position) === false,
  );
  const standardPositions = positionsList.filter(
    (position) =>
      !compoundPositionCompositions[position]?.some((subPosition) =>
        positionsList.includes(subPosition),
      ) && position !== "BN",
  );
  const compoundPositions = positionsList.filter(
    (position) => !standardPositions.includes(position) && position !== "BN",
  );

  assignStandardPositions();
  distributeCompoundPositions();
  distributeBenchPositions();
  assignCompoundPositions();

  return result;

  function assignStandardPositions() {
    for (const position of standardPositions) {
      result[position] = rosterPositions[position] * numTeams;
    }
  }

  function distributeCompoundPositions() {
    for (const compoundPosition of compoundPositions) {
      const numPlayersAtCompoundPosition = rosterPositions[compoundPosition];

      const subPositions: string[] = compoundPositionCompositions[
        compoundPosition
      ].filter((subPosition) => standardPositions.includes(subPosition));

      const numStarters = subPositions.reduce(
        (acc, subPosition) => acc + rosterPositions[subPosition],
        0,
      );

      distributeExtraPositions(
        subPositions,
        numStarters,
        numPlayersAtCompoundPosition,
      );
    }
  }

  function distributeBenchPositions() {
    const numBenchPositions = rosterPositions.BN;

    if (numBenchPositions > 0) {
      const numBenchPlayers = numBenchPositions;
      const numStarters = Object.keys(result).reduce(
        (acc, position) => acc + rosterPositions[position],
        0,
      );

      const sortedList = Object.keys(result);
      distributeExtraPositions(sortedList, numStarters, numBenchPlayers);
    }
  }

  function assignCompoundPositions() {
    // assign to the compound position itself as a fallback for cases where not all sub-positions are accounted for
    // ex. QBs in leagues with only Q/W/R/T flex positions (no explicit QB  replacement level will exist for QB players)
    for (const compoundPosition of compoundPositions) {
      const subPositions: string[] = compoundPositionCompositions[
        compoundPosition
      ].filter((subPosition) => standardPositions.includes(subPosition));

      result[compoundPosition] = subPositions.reduce(
        (acc, subPosition) => acc + result[subPosition],
        0,
      );
    }
  }

  function distributeExtraPositions(
    positionList: string[],
    numTotalStartingSpots: number,
    numSpotsToDistribute: number,
  ) {
    let numPlayersToDistribute = numSpotsToDistribute * numTeams;

    const sortedPositionList = [...positionList].sort(
      (a, b) =>
        (maxExtraPlayers[a] ?? Number.POSITIVE_INFINITY) -
        (maxExtraPlayers[b] ?? Number.POSITIVE_INFINITY),
    );

    let remainingStartingSpots = numTotalStartingSpots;

    for (const position of sortedPositionList) {
      const numStartersAtPosition = rosterPositions[position];
      const newShare =
        (numStartersAtPosition / remainingStartingSpots) *
        numPlayersToDistribute;

      const extraAllowed: number | undefined = maxExtraPlayers[position];
      const totalAllowed: number =
        extraAllowed !== undefined
          ? (numStartersAtPosition + extraAllowed) * numTeams
          : Number.POSITIVE_INFINITY;

      const newTotal = Math.min(newShare + result[position], totalAllowed);
      const numAdded = newTotal - result[position];

      numPlayersToDistribute -= numAdded;
      remainingStartingSpots -= rosterPositions[position];

      result[position] = newTotal;
    }
  }
}
