import type { Leagues } from "@common/types/Leagues.js";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";

import { ensureType } from "@common/utilities/checks.js";
import { CloudTasksClient } from "@google-cloud/tasks";
import { Effect, Either, Schema } from "effect";

import {
  db,
  storeTodaysPostponedTeams,
} from "../../../core/src/common/services/firebase/firestore.service.js";
import {
  getPacificTimeDateString,
  todayPacific,
} from "../../../core/src/common/services/utilities.service.js";
import { fetchStartingPlayers } from "../../../core/src/common/services/yahooAPI/yahooStartingPlayer.service.js";
import { SportsnetGamesResponseSchema } from "../../../core/src/scheduleSetLineup/interfaces/SportsnetGamesResponse.js";
import { YahooGamesResponseSchema } from "../../../core/src/scheduleSetLineup/interfaces/YahooGamesReponse.js";

export class SchedulingError extends Schema.TaggedError<SchedulingError>()("SchedulingError", {
  message: Schema.String,
  error: Schema.optional(Schema.Defect),
}) {}

export interface GameStartTimes {
  readonly nba: readonly number[];
  readonly nhl: readonly number[];
  readonly nfl: readonly number[];
  readonly mlb: readonly number[];
}

export interface TeamData {
  readonly uid: string;
  readonly game_code: Leagues;
  readonly start_date: number;
  readonly team_key?: string;
}

interface LoadTodaysGamesResult {
  readonly loadedFromDB: boolean;
  readonly gameStartTimes: GameStartTimes;
}

interface EnqueuedTask {
  readonly uid: string;
  readonly teams: readonly TeamData[];
}

/**
 * Determine the leagues that we will set lineups for at this time.
 * Games starting in the next hour will be set.
 * All leagues with games today will be set if this is the first execution of the day.
 */
export const leaguesToSetLineupsFor = Effect.fn("scheduling.leaguesToSetLineupsFor")(function* () {
  const todayDate = getPacificTimeDateString(new Date());
  const { loadedFromDB, gameStartTimes } = yield* loadTodaysGames(todayDate);

  if (loadedFromDB) {
    const leagues = findLeaguesPlayingNextHour(gameStartTimes);
    if (leagues.length === 0) {
      yield* Effect.logInfo("No games starting in the next hour");
      return [];
    }
    return leagues;
  }

  return Object.keys(gameStartTimes) as Leagues[];
});

/**
 * Determine if there are any leagues starting games in the next hour.
 */
export function findLeaguesPlayingNextHour(gameStartTimes: GameStartTimes): Leagues[] {
  const now = Date.now();
  const nextHour = now + 3600000;

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
 * Fetches the game start times for all leagues today, either from Firestore or APIs.
 */
export const loadTodaysGames = Effect.fn("scheduling.loadTodaysGames")(function* (
  todayDate: string,
) {
  const scheduleDoc = yield* Effect.tryPromise({
    try: () => db.collection("schedule").doc("today").get(),
    catch: (error) =>
      SchedulingError.make({
        message: "Failed to fetch schedule from Firestore",
        error,
      }),
  });

  const scheduleDocData = scheduleDoc.data();
  if (!(scheduleDoc.exists && scheduleDocData) || scheduleDocData.date !== todayDate) {
    yield* Effect.logInfo("No games in database, fetching from internet");
    const gameStartTimes = yield* getTodaysGames(todayDate);
    return { loadedFromDB: false, gameStartTimes } as LoadTodaysGamesResult;
  }

  return {
    loadedFromDB: true,
    gameStartTimes: scheduleDocData.games as GameStartTimes,
  } as LoadTodaysGamesResult;
});

/**
 * Fetches the game start times for all leagues from Yahoo/Sportsnet APIs and stores them.
 */
export const getTodaysGames = Effect.fn("scheduling.getTodaysGames")(function* (todayDate: string) {
  const leagues: readonly Leagues[] = ["nba", "nhl", "nfl", "mlb"];
  const gameStartTimes: {
    nba: number[];
    nhl: number[];
    nfl: number[];
    mlb: number[];
  } = {
    nba: [],
    nhl: [],
    nfl: [],
    mlb: [],
  };

  for (const league of leagues) {
    const times = yield* getGameTimesWithFallback(league, todayDate);
    (gameStartTimes as Record<Leagues, number[]>)[league] = times;
  }

  yield* Effect.tryPromise({
    try: () =>
      db.collection("schedule").doc("today").set({ date: todayDate, games: gameStartTimes }),
    catch: (error) =>
      SchedulingError.make({
        message: "Failed to store schedule in Firestore",
        error,
      }),
  });

  return gameStartTimes;
});

function getGameTimesWithFallback(
  league: Leagues,
  todayDate: string,
): Effect.Effect<number[], SchedulingError> {
  return Effect.gen(function* () {
    const yahooResult = yield* Effect.either(getGameTimesYahoo(league, todayDate));

    if (Either.isRight(yahooResult)) {
      return yahooResult.right;
    }

    yield* Effect.logError("Error fetching games from Yahoo API").pipe(
      Effect.annotateLogs("error", yahooResult.left.message),
    );
    yield* Effect.logInfo("Trying to get games from Sportsnet API");

    const sportsnetResult = yield* Effect.either(getGameTimesSportsnet(league, todayDate));

    if (Either.isRight(sportsnetResult)) {
      return sportsnetResult.right;
    }

    yield* Effect.logError("Error fetching games from Sportsnet API").pipe(
      Effect.annotateLogs("error", sportsnetResult.left.message),
    );
    return [];
  });
}

function getGameTimesYahoo(
  league: Leagues,
  todayDate: string,
): Effect.Effect<number[], SchedulingError> {
  return Effect.tryPromise({
    try: async () => {
      const url = `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games;date=${todayDate}?format=json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json: unknown = await response.json();
      const data = ensureType(json, YahooGamesResponseSchema);

      const gamesJSON = data.league.games[0];
      const gameTimesSet: number[] = [];
      for (const game of gamesJSON) {
        const gameStart = Date.parse(game.game.start_time);
        gameTimesSet.push(gameStart);
      }

      return Array.from(new Set(gameTimesSet));
    },
    catch: (error) =>
      SchedulingError.make({
        message: `Failed to fetch games from Yahoo for ${league}`,
        error,
      }),
  });
}

function getGameTimesSportsnet(
  league: Leagues,
  todayDate: string,
): Effect.Effect<number[], SchedulingError> {
  return Effect.tryPromise({
    try: async () => {
      const url = `https://mobile-statsv2.sportsnet.ca/scores?league=${league}&team=&day=${todayDate}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json: unknown = await response.json();
      const data = ensureType(json, SportsnetGamesResponseSchema);

      const gamesJSON = data.data[0].games;
      const gameTimesSet: number[] = [];
      for (const game of gamesJSON) {
        const gameStart = game.details.timestamp * 1000;
        gameTimesSet.push(gameStart);
      }

      return Array.from(new Set(gameTimesSet));
    },
    catch: (error) =>
      SchedulingError.make({
        message: `Failed to fetch games from Sportsnet for ${league}`,
        error,
      }),
  });
}

/**
 * Sets the postponed teams for the given leagues in the database.
 */
export const setTodaysPostponedTeams = Effect.fn("scheduling.setTodaysPostponedTeams")(function* (
  leagues: readonly Leagues[],
) {
  const today = todayPacific();
  const postponedTeams: string[] = [];

  for (const league of leagues) {
    const teams = yield* getPostponedTeamsYahoo(league, today);
    postponedTeams.push(...teams);
  }

  if (postponedTeams.length === 0) {
    return;
  }

  yield* Effect.tryPromise({
    try: () => storeTodaysPostponedTeams(postponedTeams),
    catch: (error) =>
      SchedulingError.make({
        message: "Failed to store postponed teams",
        error,
      }),
  });
});

/**
 * Gets postponed teams from Yahoo for a specific league.
 */
export function getPostponedTeamsYahoo(
  league: Leagues,
  todayDate: string,
): Effect.Effect<readonly string[], SchedulingError> {
  return Effect.tryPromise({
    try: async () => {
      const url = `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games;date=${todayDate}?format=json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json: unknown = await response.json();
      const data = ensureType(json, YahooGamesResponseSchema);

      const gamesJSON = data.league.games[0];
      const postponedTeams: string[] = [];

      for (const game of gamesJSON) {
        if (game.game.game_status.type === "status.type.postponed") {
          console.info(`Postponed game found for ${league}`, game.game);
          const awayTeamId = game.game.team_ids[0]?.away_team_id;
          const homeTeamId = game.game.team_ids[1]?.home_team_id;
          if (awayTeamId) {
            postponedTeams.push(awayTeamId);
          }
          if (homeTeamId) {
            postponedTeams.push(homeTeamId);
          }
        }
      }

      return postponedTeams;
    },
    catch: (error) =>
      SchedulingError.make({
        message: `Failed to fetch postponed teams from Yahoo for ${league}`,
        error,
      }),
  });
}

/**
 * Sets starting players (goalies/pitchers) for today if teams exist for leagues that need them.
 */
export function setStartingPlayersForToday(
  teamsSnapshot: QuerySnapshot<DocumentData>,
): Effect.Effect<void, SchedulingError> {
  return Effect.gen(function* () {
    const leaguesWithStarters: readonly Leagues[] = ["nhl", "mlb"];

    for (const league of leaguesWithStarters) {
      const hasTeam = teamsSnapshot?.docs?.some((doc) => doc.data().game_code === league);
      if (hasTeam) {
        const result = yield* Effect.either(
          Effect.tryPromise({
            try: () => fetchStartingPlayers(league),
            catch: (error) =>
              SchedulingError.make({
                message: `Error fetching starting players for ${league.toUpperCase()} from Yahoo`,
                error,
              }),
          }),
        );

        if (Either.isLeft(result)) {
          yield* Effect.logError(result.left.message);
        }
      }
    }
  });
}

/**
 * Maps users to their active teams from a Firestore snapshot.
 */
export function mapUsersToActiveTeams(
  teamsSnapshot: QuerySnapshot<DocumentData>,
): Map<string, TeamData[]> {
  if (teamsSnapshot.size === 0) {
    return new Map();
  }

  const result = new Map<string, TeamData[]>();
  for (const doc of teamsSnapshot?.docs ?? []) {
    const team = doc.data() as TeamData;
    const uid = team.uid;
    const teamWithKey: TeamData = {
      ...team,
      team_key: doc.id,
    };

    if (team.start_date <= Date.now()) {
      const userTeams = result.get(uid);
      if (userTeams === undefined) {
        result.set(uid, [teamWithKey]);
      } else {
        userTeams.push(teamWithKey);
      }
    }
  }

  return result;
}

/**
 * Creates Cloud Tasks for each user's teams.
 */
export const enqueueUsersTeams = Effect.fn("scheduling.enqueueUsersTeams")(function* (
  activeUsers: Map<string, TeamData[]>,
  queueName: string,
) {
  const tasksClient = new CloudTasksClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION;
  const mutationApiUrl = process.env.MUTATION_API_URL;

  if (!(projectId && location && mutationApiUrl)) {
    return yield* SchedulingError.make({
      message:
        "Missing required environment variables: GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_LOCATION, or MUTATION_API_URL",
    });
  }

  const parent = tasksClient.queuePath(projectId, location, queueName);
  const enqueuedTasks: EnqueuedTask[] = [];

  for (const [uid, teams] of activeUsers) {
    const taskPayload = { uid, teams };

    yield* Effect.tryPromise({
      try: async () => {
        const cloudTask = {
          httpRequest: {
            httpMethod: "POST" as const,
            url: `${mutationApiUrl}/execute/set-lineup`,
            headers: {
              "Content-Type": "application/json",
            },
            body: Buffer.from(JSON.stringify(taskPayload)).toString("base64"),
          },
          dispatchDeadline: {
            seconds: 60 * 5,
          },
        };

        await tasksClient.createTask({ parent, task: cloudTask });
      },
      catch: (error) =>
        SchedulingError.make({
          message: `Failed to create Cloud Task for user ${uid}`,
          error,
        }),
    });

    enqueuedTasks.push(taskPayload);
  }

  return enqueuedTasks;
});
