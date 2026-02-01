import type { Leagues } from "@common/types/Leagues.js";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";
import type { TaskQueue } from "firebase-admin/functions";

import { ensureType } from "@common/utilities/checks.js";
import { logger } from "firebase-functions";

import type { GameStartTimes } from "../interfaces/GameStartTimes.js";

import { db, storeTodaysPostponedTeams } from "../../common/services/firebase/firestore.service.js";
import { getPacificTimeDateString, todayPacific } from "../../common/services/utilities.service.js";
import { fetchStartingPlayers } from "../../common/services/yahooAPI/yahooStartingPlayer.service.js";
import { SportsnetGamesResponseSchema } from "../interfaces/SportsnetGamesResponse.js";
import {
  YahooLeagueGameIdsByDateResponseSchema,
  YahooScoreboardGameResponseSchema,
} from "../interfaces/YahooGamesReponse.js";

/**
 * Determine the leagues that we will set lineups for at this time
 * Any games that are starting in the next hour will be set.
 * All leagues with games today will be set if this is the first execution of
 * the day.
 *
 *
 * @export
 * @async
 * @return {Promise<Leagues[]>} - The leagues that will have lineups set
 */
export async function leaguesToSetLineupsFor(): Promise<Leagues[]> {
  // load all of the game start times for today
  const todayDate: string = getPacificTimeDateString(new Date());
  let leagues: Leagues[];
  const { loadedFromDB, gameStartTimes } = await loadTodaysGames(todayDate);
  if (loadedFromDB) {
    // If the games were loaded from the database, then check if any games are
    // starting in the next hour.
    leagues = findLeaguesPlayingNextHour(gameStartTimes);

    if (leagues.length === 0) {
      logger.log("No games starting in the next hour");
      // If there are no games starting in the next hour, then we will not
      // set any lineups.
      return [];
    }
  } else {
    // If this is the first time the games are being loaded, then we will
    // set the lineup for all leagues with teams playing any time today.
    leagues = Object.keys(gameStartTimes) as Leagues[];
  }
  return leagues;
}

/**
 * Determine if there are any leagues starting games in the next hour
 *
 * @export
 * @param {GameStartTimes[]} gameStartTimes - The games for today
 * @return {{}} - The leagues that are playing in the next hour
 */
function findLeaguesPlayingNextHour(gameStartTimes: GameStartTimes) {
  const now: number = Date.now();
  const nextHour: number = now + 3600000;

  const result: Leagues[] = [];
  for (const [league, gameTimestamps] of Object.entries(gameStartTimes)) {
    for (const timestamp of gameTimestamps) {
      if (timestamp > now && timestamp < nextHour) {
        result.push(league as Leagues);
        break;
      }
    }
  }
  return result;
}

/**
 * Fetches the game start times for all leagues today
 *
 * @export
 * @async
 * @param {string} todayDate - The date to fetch the games for
 * @return {Promise<GameStartTimes[]>} - The game start times
 */
async function loadTodaysGames(todayDate: string) {
  // TODO: Move all calls to db into firestore.service
  let gameStartTimes: GameStartTimes;
  let loadedFromDB: boolean;
  const scheduleDoc = await db.collection("schedule").doc("today").get();
  const scheduleDocData = scheduleDoc.data();
  if (!(scheduleDoc.exists && scheduleDocData) || scheduleDocData.date !== todayDate) {
    logger.log("No games in database, fetching from internet");
    gameStartTimes = await getTodaysGames(todayDate);
    loadedFromDB = false;
  } else {
    gameStartTimes = scheduleDocData.games;
    loadedFromDB = true;
  }
  return { loadedFromDB, gameStartTimes };
}

/**
 * Fetches the game start times for the given league and date from the Yahoo
 *
 * @async
 * @param {string} todayDate - The date to fetch the games for
 * @return {Promise<GameStartTimes[]>} - The game start times
 */
export async function getTodaysGames(todayDate: string): Promise<GameStartTimes> {
  const leagues: Leagues[] = ["nba", "nhl", "nfl", "mlb"];
  // get today's gametimes for each league
  const gameStartTimes: GameStartTimes = {
    nba: [],
    nhl: [],
    nfl: [],
    mlb: [],
  };

  for (const league of leagues) {
    try {
      gameStartTimes[league] = await getGameTimesYahoo(league, todayDate);
    } catch (error: unknown) {
      logger.error("Error fetching games from Yahoo API", error);
      // get gamestimes from Sportsnet as a backup plan
      logger.log("Trying to get games from Sportsnet API");
      try {
        gameStartTimes[league] = await getGameTimesSportsnet(league);
      } catch (error: unknown) {
        logger.error("Error fetching games from Sportsnet API", error);
      }
    }
  }

  // TODO: Move all calls to db into firestore.service
  await db.collection("schedule").doc("today").set({ date: todayDate, games: gameStartTimes });

  return gameStartTimes;
}
/**
 * Get the game start times for a given league and date from the Yahoo Graphite API
 *
 * @async
 * @param {string} league - league to get games for
 * @param {string} todayDate - date to get games for
 */
async function getGameTimesYahoo(league: Leagues, todayDate: string): Promise<number[]> {
  const season = todayDate.split("-")[0];
  const url = `https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate?lang=en-US&region=US&tz=America%2FEdmonton&ysp_platform=next-app-sports&leagues=${league}&dates=${todayDate}&season=${season}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const json: unknown = await response.json();
  const data = ensureType(json, YahooLeagueGameIdsByDateResponseSchema);

  const gameTimesSet: number[] = [];
  for (const leagueData of data.data.leagues) {
    for (const game of leagueData.games) {
      const gameStart = Date.parse(game.startTime);
      gameTimesSet.push(gameStart);
    }
  }

  return Array.from(new Set(gameTimesSet));
}

/**
 * Get the game start times for a given league from the Sportsnet ticker API
 *
 * @async
 * @param {string} league - league to get games for
 */
async function getGameTimesSportsnet(league: Leagues): Promise<number[]> {
  const url = `https://stats-api.sportsnet.ca/ticker?league=${league}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const json: unknown = await response.json();
  const data = ensureType(json, SportsnetGamesResponseSchema);

  const gameTimesSet: number[] = [];
  for (const game of data.data.games) {
    const gameStart = game.timestamp * 1000;
    gameTimesSet.push(gameStart);
  }

  return Array.from(new Set(gameTimesSet));
}

/**
 * Sets the postponed teams for the given leagues in the database
 *
 * @param {Leagues[]} leagues - An array of SportLeague objects representing the leagues.
 */
export async function setTodaysPostponedTeams(leagues: Leagues[]): Promise<void> {
  const today = todayPacific();
  const postponedTeams: string[] = [];

  for (const league of leagues) {
    const teams = await getPostponedTeamsYahoo(league, today);
    postponedTeams.push(...teams);
  }

  if (postponedTeams.length === 0) {
    return;
  }

  await storeTodaysPostponedTeams(postponedTeams);
}

/**
 * Gets postponed teams from Yahoo for a specific league using the Graphite API.
 * First fetches game list, then fetches team IDs for postponed games.
 */
async function getPostponedTeamsYahoo(league: Leagues, todayDate: string): Promise<string[]> {
  const season = todayDate.split("-")[0];
  const listUrl = `https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate?lang=en-US&region=US&tz=America%2FEdmonton&ysp_platform=next-app-sports&leagues=${league}&dates=${todayDate}&season=${season}`;
  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) {
    throw new Error(`HTTP ${listResponse.status}: ${listResponse.statusText}`);
  }
  const listJson: unknown = await listResponse.json();
  const listData = ensureType(listJson, YahooLeagueGameIdsByDateResponseSchema);

  const postponedGameIds: string[] = [];
  for (const leagueData of listData.data.leagues) {
    for (const game of leagueData.games) {
      if (game.status === "POSTPONED") {
        postponedGameIds.push(game.gameId);
      }
    }
  }

  if (postponedGameIds.length === 0) {
    return [];
  }

  const postponedTeams: string[] = [];
  for (const gameId of postponedGameIds) {
    const gameUrl = `https://graphite.sports.yahoo.com/v1/query/shangrila/scoreboardGame?lang=en-US&region=US&tz=America%2FEdmonton&ysp_platform=next-app-sports&gameId=${gameId}&season=${season}`;
    const gameResponse = await fetch(gameUrl);
    if (!gameResponse.ok) {
      logger.warn(`Failed to fetch game ${gameId} for postponed team IDs`);
      continue;
    }
    const gameJson: unknown = await gameResponse.json();
    const gameData = ensureType(gameJson, YahooScoreboardGameResponseSchema);

    for (const game of gameData.data.games) {
      logger.info(`Postponed game found for ${league}`, {
        awayTeamId: game.awayTeamId,
        homeTeamId: game.homeTeamId,
      });
      postponedTeams.push(game.awayTeamId);
      postponedTeams.push(game.homeTeamId);
    }
  }

  return postponedTeams;
}

export async function setStartingPlayersForToday(teamsSnapshot: QuerySnapshot<DocumentData>) {
  const leaguesWithStarters: Leagues[] = ["nhl", "mlb"];

  for (const league of leaguesWithStarters) {
    const hasTeam = teamsSnapshot?.docs?.some((doc) => doc.data().game_code === league);
    if (hasTeam) {
      try {
        await fetchStartingPlayers(league);
      } catch (error) {
        logger.error(
          `Error fetching starting players for ${league.toUpperCase()} from Yahoo`,
          error,
        );
      }
    }
  }
}

export function mapUsersToActiveTeams(teamsSnapshot: QuerySnapshot<DocumentData>) {
  if (teamsSnapshot.size === 0) {
    return new Map();
  }

  const result: Map<string, DocumentData> = new Map();
  for (const doc of teamsSnapshot?.docs ?? []) {
    const team = doc.data();
    const uid = team.uid;
    team.team_key = doc.id;

    // We cannot query for both start_date <= Date.now() and end_date >= Date.now()
    // in firebase, so we need to filter start date locally
    if (team.start_date <= Date.now()) {
      const userTeams = result.get(uid);
      if (userTeams === undefined) {
        result.set(uid, [team]);
      } else {
        userTeams.push(team);
      }
    }
  }

  return result;
}

export function enqueueUsersTeams(
  activeUsers: Map<string, DocumentData>,
  queue: TaskQueue<Record<string, unknown>>,
  targetFunctionUri: string,
): Promise<void>[] {
  const result = [];

  for (const [uid, teams] of activeUsers) {
    result.push(
      queue.enqueue(
        { uid, teams },
        {
          dispatchDeadlineSeconds: 60 * 5,
          uri: targetFunctionUri,
        },
      ),
    );
  }

  return result;
}
