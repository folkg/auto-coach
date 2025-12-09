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
import { FirestoreTeamPayloadSchema } from "../types/schemas.js";

export type FirestoreTeamPayload = Schema.Schema.Type<typeof FirestoreTeamPayloadSchema>;

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

interface LoadTodaysGamesResult {
  readonly loadedFromDB: boolean;
  readonly gameStartTimes: GameStartTimes;
}

interface EnqueuedTask {
  readonly uid: string;
  readonly teams: readonly FirestoreTeamPayload[];
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
      yield* Effect.logInfo("No games starting in the next hour").pipe(
        Effect.annotateLogs("phase", "scheduling"),
        Effect.annotateLogs("event", "NO_GAMES_NEXT_HOUR"),
      );
      return [];
    }
    yield* Effect.logInfo("Found leagues with games starting soon").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "LEAGUES_FOUND"),
      Effect.annotateLogs("leagues", leagues.join(",")),
    );
    return leagues;
  }

  yield* Effect.logInfo("First run of day - processing all leagues").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "FIRST_RUN_OF_DAY"),
  );
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
    yield* Effect.logInfo("No games in database, fetching from internet").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "FETCH_GAMES_FROM_API"),
      Effect.annotateLogs("service", "yahoo"),
    );
    const gameStartTimes = yield* getTodaysGames(todayDate);
    return { loadedFromDB: false, gameStartTimes } as LoadTodaysGamesResult;
  }

  yield* Effect.logDebug("Loaded games from Firestore cache").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "GAMES_LOADED_FROM_CACHE"),
  );
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
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "YAHOO_GAMES_FETCH_FAILED"),
      Effect.annotateLogs("service", "yahoo"),
      Effect.annotateLogs("league", league),
      Effect.annotateLogs("errorMessage", yahooResult.left.message),
      Effect.annotateLogs("outcome", "handled-error"),
      Effect.annotateLogs("terminated", false),
    );

    yield* Effect.logInfo("Trying to get games from Sportsnet API").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "SPORTSNET_FALLBACK"),
      Effect.annotateLogs("service", "sportsnet"),
      Effect.annotateLogs("league", league),
    );

    const sportsnetResult = yield* Effect.either(getGameTimesSportsnet(league, todayDate));

    if (Either.isRight(sportsnetResult)) {
      return sportsnetResult.right;
    }

    yield* Effect.logError("Error fetching games from Sportsnet API").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "SPORTSNET_GAMES_FETCH_FAILED"),
      Effect.annotateLogs("service", "sportsnet"),
      Effect.annotateLogs("league", league),
      Effect.annotateLogs("errorMessage", sportsnetResult.left.message),
      Effect.annotateLogs("outcome", "handled-error"),
      Effect.annotateLogs("terminated", false),
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
    yield* Effect.logDebug("No postponed teams found").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "NO_POSTPONED_TEAMS"),
    );
    return;
  }

  yield* Effect.logInfo("Found postponed teams").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "POSTPONED_TEAMS_FOUND"),
    Effect.annotateLogs("postponedTeamCount", postponedTeams.length),
  );

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
          yield* Effect.logError("Failed to fetch starting players").pipe(
            Effect.annotateLogs("phase", "scheduling"),
            Effect.annotateLogs("event", "STARTING_PLAYERS_FETCH_FAILED"),
            Effect.annotateLogs("service", "yahoo"),
            Effect.annotateLogs("league", league),
            Effect.annotateLogs("errorMessage", result.left.message),
            Effect.annotateLogs("outcome", "handled-error"),
            Effect.annotateLogs("terminated", false),
          );
        } else {
          yield* Effect.logDebug("Fetched starting players").pipe(
            Effect.annotateLogs("phase", "scheduling"),
            Effect.annotateLogs("event", "STARTING_PLAYERS_FETCHED"),
            Effect.annotateLogs("league", league),
          );
        }
      }
    }
  });
}

/**
 * Maps users to their active teams from a Firestore snapshot.
 * Validates each team document against the schema.
 */
export const mapUsersToActiveTeams = Effect.fn("scheduling.mapUsersToActiveTeams")(function* (
  teamsSnapshot: QuerySnapshot<DocumentData>,
) {
  if (teamsSnapshot.size === 0) {
    yield* Effect.logDebug("No teams in snapshot").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "EMPTY_TEAMS_SNAPSHOT"),
    );
    return new Map<string, FirestoreTeamPayload[]>();
  }

  const result = new Map<string, FirestoreTeamPayload[]>();
  let skippedCount = 0;

  for (const doc of teamsSnapshot?.docs ?? []) {
    const rawData = doc.data();
    const dataWithKey = { ...rawData, team_key: doc.id };

    const parseResult = yield* Effect.either(
      Schema.decodeUnknown(FirestoreTeamPayloadSchema)(dataWithKey),
    );

    if (Either.isLeft(parseResult)) {
      yield* Effect.logWarning("Skipping invalid team document").pipe(
        Effect.annotateLogs("phase", "scheduling"),
        Effect.annotateLogs("event", "INVALID_TEAM_DOCUMENT"),
        Effect.annotateLogs("teamKey", doc.id),
        Effect.annotateLogs("errorMessage", parseResult.left.message),
        Effect.annotateLogs("outcome", "handled-error"),
      );
      skippedCount++;
      continue;
    }

    const team = parseResult.right;
    const uid = team.uid;

    if (team.start_date <= Date.now()) {
      const userTeams = result.get(uid);
      if (userTeams === undefined) {
        result.set(uid, [team]);
      } else {
        userTeams.push(team);
      }
    }
  }

  if (skippedCount > 0) {
    yield* Effect.logWarning("Some team documents were skipped due to validation errors").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "TEAMS_SKIPPED_SUMMARY"),
      Effect.annotateLogs("skippedCount", skippedCount),
    );
  }

  yield* Effect.logInfo("Mapped users to active teams").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "USERS_MAPPED"),
    Effect.annotateLogs("userCount", result.size),
    Effect.annotateLogs("totalTeams", teamsSnapshot.size - skippedCount),
  );

  return result;
});

/**
 * Creates Cloud Tasks for each user's teams.
 */
export const enqueueUsersTeams = Effect.fn("scheduling.enqueueUsersTeams")(function* (
  activeUsers: Map<string, FirestoreTeamPayload[]>,
  queueName: string,
) {
  const tasksClient = new CloudTasksClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION;
  const mutationApiUrl = process.env.MUTATION_API_URL;

  if (!(projectId && location && mutationApiUrl)) {
    yield* Effect.logError("Missing required environment variables for Cloud Tasks").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "MISSING_ENV_VARS"),
      Effect.annotateLogs("service", "cloudtasks"),
    );
    return yield* SchedulingError.make({
      message:
        "Missing required environment variables: GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_LOCATION, or MUTATION_API_URL",
    });
  }

  const parent = tasksClient.queuePath(projectId, location, queueName);
  const enqueuedTasks: EnqueuedTask[] = [];

  for (const [uid, teams] of activeUsers) {
    const taskId = `set-lineup-${uid}-${Date.now()}`;
    const taskPayload = {
      task: {
        id: taskId,
        type: "SET_LINEUP" as const,
        payload: { uid, teams },
        userId: uid,
        createdAt: new Date().toISOString(),
        status: "PENDING" as const,
      },
    };

    yield* Effect.tryPromise({
      try: async () => {
        const cloudTask = {
          httpRequest: {
            httpMethod: "POST" as const,
            url: `${mutationApiUrl}/mutations/execute/mutation`,
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
    }).pipe(
      Effect.tap(() =>
        Effect.logDebug("Created Cloud Task").pipe(
          Effect.annotateLogs("phase", "scheduling"),
          Effect.annotateLogs("event", "CLOUD_TASK_CREATED"),
          Effect.annotateLogs("service", "cloudtasks"),
          Effect.annotateLogs("userId", uid),
          Effect.annotateLogs("taskId", taskId),
          Effect.annotateLogs("teamCount", teams.length),
        ),
      ),
    );

    enqueuedTasks.push({ uid, teams });
  }

  yield* Effect.logInfo("Finished enqueueing Cloud Tasks").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "CLOUD_TASKS_ENQUEUED"),
    Effect.annotateLogs("service", "cloudtasks"),
    Effect.annotateLogs("taskCount", enqueuedTasks.length),
  );

  return enqueuedTasks;
});
