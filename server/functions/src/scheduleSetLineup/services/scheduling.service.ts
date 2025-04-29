import axios, { isAxiosError } from "axios";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";
import type { TaskQueue } from "firebase-admin/functions";
import { logger } from "firebase-functions";
import type { SportLeague } from "../../common/interfaces/SportLeague.js";
import {
  db,
  storeTodaysPostponedTeams,
} from "../../common/services/firebase/firestore.service.js";
import {
  getPacificTimeDateString,
  todayPacific,
} from "../../common/services/utilities.service.js";
import { fetchStartingPlayers } from "../../common/services/yahooAPI/yahooStartingPlayer.service.js";
import type { GameStartTimes } from "../interfaces/GameStartTimes.js";
import type { SportsnetGamesResponse } from "../interfaces/SportsnetGamesResponse.js";
import type { YahooGamesReponse } from "../interfaces/YahooGamesReponse.js";

/**
 * Determine the leagues that we will set lineups for at this time
 * Any games that are starting in the next hour will be set.
 * All leagues with games today will be set if this is the first execution of
 * the day.
 *
 *
 * @export
 * @async
 * @return {Promise<SportLeague[]>} - The leagues that will have lineups set
 */
export async function leaguesToSetLineupsFor(): Promise<SportLeague[]> {
  // load all of the game start times for today
  const todayDate: string = getPacificTimeDateString(new Date());
  let leagues: SportLeague[];
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
    leagues = Object.keys(gameStartTimes) as SportLeague[];
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

  const result: SportLeague[] = [];
  for (const [league, gameTimestamps] of Object.entries(gameStartTimes)) {
    for (const timestamp of gameTimestamps) {
      if (timestamp > now && timestamp < nextHour) {
        result.push(league as SportLeague);
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
  if (
    !(scheduleDoc.exists && scheduleDocData) ||
    scheduleDocData.date !== todayDate
  ) {
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
async function getTodaysGames(todayDate: string): Promise<GameStartTimes> {
  const leagues: SportLeague[] = ["nba", "nhl", "nfl", "mlb"];
  // get today's gametimes for each league
  let gameStartTimes: GameStartTimes = {};
  for (const league of leagues) {
    try {
      gameStartTimes = {
        ...gameStartTimes,
        ...(await getGameTimesYahoo(league, todayDate)),
      };
    } catch (error: unknown) {
      logger.error("Error fetching games from Yahoo API", error);
      if (isAxiosError(error) && error.response) {
        logger.error(error.response.data);
        logger.error(error.response.status);
        logger.error(error.response.headers);
      }
      // get gamestimes from Sportsnet as a backup plan
      logger.log("Trying to get games from Sportsnet API");
      try {
        gameStartTimes = {
          ...gameStartTimes,
          ...(await getGameTimesSportsnet(league, todayDate)),
        };
      } catch (error: unknown) {
        logger.error("Error fetching games from Sportsnet API", error);
        if (isAxiosError(error) && error.response) {
          logger.error(error.response.data);
          logger.error(error.response.status);
          logger.error(error.response.headers);
        }
      }
    }
  }

  // TODO: Move all calls to db into firestore.service
  await db
    .collection("schedule")
    .doc("today")
    .set({ date: todayDate, games: gameStartTimes });

  return gameStartTimes;
}
/**
 * Get the game start times for a given league and date from the Yahoo API
 *
 * @async
 * @param {string} league - league to get games for
 * @param {string} todayDate - date to get games for
 */
async function getGameTimesYahoo(
  league: string,
  todayDate: string,
): Promise<GameStartTimes> {
  const url = `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games;date=${todayDate}?format=json`;
  const { data } = await axios.get<YahooGamesReponse>(url);

  // get the game timestamp for each game in the response
  const gamesJSON = data.league.games[0];
  const gameTimesSet: number[] = [];
  for (const game of gamesJSON) {
    const gameStart = Date.parse(game.game.start_time);
    gameTimesSet.push(gameStart);
  }

  const gameTimesArray = Array.from(new Set(gameTimesSet));
  // use the league as the key for the object
  return { [league]: gameTimesArray };
}

/**
 * Get the game start times for a given league and date from the Sportsnet API
 *
 * @async
 * @param {string} league - league to get games for
 * @param {string} todayDate - date to get games for
 */
async function getGameTimesSportsnet(
  league: string,
  todayDate: string,
): Promise<GameStartTimes> {
  const url = `https://mobile-statsv2.sportsnet.ca/scores?league=${league}&team=&day=${todayDate}`;
  const { data } = await axios.get<SportsnetGamesResponse>(url);

  // get the game timestamp for each game in the response
  const gamesJSON = data.data[0].games;

  const gameTimesSet: number[] = [];

  for (const game of gamesJSON) {
    const gameStart = game.details.timestamp * 1000;
    gameTimesSet.push(gameStart);
  }

  const gameTimesArray = Array.from(new Set(gameTimesSet));
  return { [league]: gameTimesArray };
}

/**
 * Sets the postponed teams for the given leagues in the database
 *
 * @param {SportLeague[]} leagues - An array of SportLeague objects representing the leagues.
 */
export async function setTodaysPostponedTeams(
  leagues: SportLeague[],
): Promise<void> {
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

async function getPostponedTeamsYahoo(
  league: string,
  todayDate: string,
): Promise<string[]> {
  const url = `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games;date=${todayDate}?format=json`;
  const { data } = await axios.get<YahooGamesReponse>(url);

  const gamesJSON = data.league.games[0];
  const postponedTeams: string[] = [];

  for (const game of gamesJSON) {
    if (game.game.game_status.type === "status.type.postponed") {
      logger.info(`Postponed game found for ${league}`, game.game);
      postponedTeams.push(game.game.team_ids[0].away_team_id);
      postponedTeams.push(game.game.team_ids[1].home_team_id);
    }
  }

  return postponedTeams;
}

export async function setStartingPlayersForToday(
  teamsSnapshot: QuerySnapshot<DocumentData>,
) {
  const leaguesWithStarters: SportLeague[] = ["nhl", "mlb"];

  for (const league of leaguesWithStarters) {
    const hasTeam = teamsSnapshot?.docs?.some(
      (doc) => doc.data().game_code === league,
    );
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

export function mapUsersToActiveTeams(
  teamsSnapshot: QuerySnapshot<DocumentData>,
) {
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
