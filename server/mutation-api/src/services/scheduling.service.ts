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
  getCurrentPacificNumDay,
  getPacificStartOfDay,
  getPacificTimeDateString,
  isTodayPacific,
  todayPacific,
} from "../../../core/src/common/services/utilities.service.js";
import { fetchStartingPlayers } from "../../../core/src/common/services/yahooAPI/yahooStartingPlayer.service.js";
import { SportsnetGamesResponseSchema } from "../../../core/src/scheduleSetLineup/interfaces/SportsnetGamesResponse.js";
import {
  YahooLeagueGameIdsByDateResponseSchema,
  YahooScoreboardGameResponseSchema,
} from "../../../core/src/scheduleSetLineup/interfaces/YahooGamesReponse.js";
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

export type LeagueScheduleInfo = {
  readonly league: Leagues;
  readonly hasGamesToday: boolean;
  readonly hasGameNextHour: boolean;
};

export type ScheduleInfo = {
  readonly leagues: readonly LeagueScheduleInfo[];
  readonly leaguesWithGamesToday: readonly Leagues[];
};

/** Maximum number of failures before a team is blocked for the day */
export const MAX_DAILY_FAILURES = 3;

/**
 * Gets schedule info for all leagues - which leagues have games today and next hour.
 * This is the main entry point for determining what work needs to be done.
 */
export const getScheduleInfo = Effect.fn("scheduling.getScheduleInfo")(function* () {
  const todayDate = getPacificTimeDateString(new Date());
  const { gameStartTimes } = yield* loadTodaysGames(todayDate);

  const now = Date.now();
  const nextHour = now + 3600000;

  const leagues: LeagueScheduleInfo[] = [];
  const leaguesWithGamesToday: Leagues[] = [];

  for (const [league, timestamps] of Object.entries(gameStartTimes) as [
    Leagues,
    readonly number[],
  ][]) {
    const hasGamesToday = timestamps.length > 0;
    const hasGameNextHour = timestamps.some((ts) => ts > now && ts < nextHour);

    if (hasGamesToday) {
      leaguesWithGamesToday.push(league);
      leagues.push({ league, hasGamesToday, hasGameNextHour });
    }
  }

  yield* Effect.logInfo("Computed schedule info").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "SCHEDULE_INFO_COMPUTED"),
    Effect.annotateLogs("leaguesWithGamesToday", leaguesWithGamesToday.join(",")),
    Effect.annotateLogs(
      "leaguesWithGamesNextHour",
      leagues
        .filter((l) => l.hasGameNextHour)
        .map((l) => l.league)
        .join(","),
    ),
  );

  return { leagues, leaguesWithGamesToday } as ScheduleInfo;
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

    const sportsnetResult = yield* Effect.either(getGameTimesSportsnet(league));

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
    },
    catch: (error) =>
      SchedulingError.make({
        message: `Failed to fetch games from Yahoo for ${league}`,
        error,
      }),
  });
}

function getGameTimesSportsnet(league: Leagues): Effect.Effect<number[], SchedulingError> {
  return Effect.tryPromise({
    try: async () => {
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
    },
    catch: (error) =>
      SchedulingError.make({
        message: `Failed to fetch games from Sportsnet for ${league}`,
        error,
      }),
  });
}

function getPostponedTeamsSportsnet(
  league: Leagues,
): Effect.Effect<readonly string[], SchedulingError> {
  return Effect.tryPromise({
    try: async () => {
      const url = `https://stats-api.sportsnet.ca/ticker?league=${league}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json: unknown = await response.json();
      const data = ensureType(json, SportsnetGamesResponseSchema);

      const postponedTeams: string[] = [];
      for (const game of data.data.games) {
        if (game.game_status === "Postponed") {
          postponedTeams.push(game.visiting_team.id);
          postponedTeams.push(game.home_team.id);
        }
      }

      return postponedTeams;
    },
    catch: (error) =>
      SchedulingError.make({
        message: `Failed to fetch postponed teams from Sportsnet for ${league}`,
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
    const teams = yield* getPostponedTeamsWithFallback(league, today);
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

function getPostponedTeamsWithFallback(
  league: Leagues,
  todayDate: string,
): Effect.Effect<readonly string[], SchedulingError> {
  return Effect.gen(function* () {
    const yahooResult = yield* Effect.either(getPostponedTeamsYahoo(league, todayDate));

    if (Either.isRight(yahooResult)) {
      return yahooResult.right;
    }

    yield* Effect.logError("Error fetching postponed teams from Yahoo API").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "YAHOO_POSTPONED_FETCH_FAILED"),
      Effect.annotateLogs("service", "yahoo"),
      Effect.annotateLogs("league", league),
      Effect.annotateLogs("errorMessage", yahooResult.left.message),
      Effect.annotateLogs("outcome", "handled-error"),
      Effect.annotateLogs("terminated", false),
    );

    yield* Effect.logInfo("Trying to get postponed teams from Sportsnet API").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "SPORTSNET_POSTPONED_FALLBACK"),
      Effect.annotateLogs("service", "sportsnet"),
      Effect.annotateLogs("league", league),
    );

    const sportsnetResult = yield* Effect.either(getPostponedTeamsSportsnet(league));

    if (Either.isRight(sportsnetResult)) {
      return sportsnetResult.right;
    }

    yield* Effect.logError("Error fetching postponed teams from Sportsnet API").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "SPORTSNET_POSTPONED_FETCH_FAILED"),
      Effect.annotateLogs("service", "sportsnet"),
      Effect.annotateLogs("league", league),
      Effect.annotateLogs("errorMessage", sportsnetResult.left.message),
      Effect.annotateLogs("outcome", "handled-error"),
      Effect.annotateLogs("terminated", false),
    );

    return [];
  });
}

/**
 * Gets postponed teams from Yahoo for a specific league.
 * Uses the new Graphite API: first fetches game list, then fetches team IDs for postponed games.
 */
export function getPostponedTeamsYahoo(
  league: Leagues,
  todayDate: string,
): Effect.Effect<readonly string[], SchedulingError> {
  return Effect.tryPromise({
    try: async () => {
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
          continue;
        }
        const gameJson: unknown = await gameResponse.json();
        const gameData = ensureType(gameJson, YahooScoreboardGameResponseSchema);

        for (const game of gameData.data.games) {
          postponedTeams.push(game.awayTeamId);
          postponedTeams.push(game.homeTeamId);
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
 * Maps users to their teams from a Firestore snapshot with minimal filtering.
 * Only validates schema and checks start_date. Used for weekly transactions
 * where set-lineup-specific filtering (paused, weekly deadline, last-set-today) is not needed.
 */
export const mapUsersToTeamsSimple = Effect.fn("scheduling.mapUsersToTeamsSimple")(function* (
  teamsSnapshot: QuerySnapshot<DocumentData>,
) {
  if (teamsSnapshot.size === 0) {
    yield* Effect.logDebug("No teams in snapshot").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "EMPTY_TEAMS_SNAPSHOT"),
    );
    return new Map<string, FirestoreTeamPayload[]>();
  }

  const now = Date.now();
  const result = new Map<string, FirestoreTeamPayload[]>();
  let skippedValidation = 0;
  let skippedNotStarted = 0;

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
      skippedValidation++;
      continue;
    }

    const team = parseResult.right;
    const uid = team.uid;

    if (team.start_date > now) {
      skippedNotStarted++;
      continue;
    }

    const userTeams = result.get(uid);
    if (userTeams === undefined) {
      result.set(uid, [team]);
    } else {
      userTeams.push(team);
    }
  }

  if (skippedValidation > 0 || skippedNotStarted > 0) {
    yield* Effect.logInfo("Team filtering summary (simple)").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "TEAM_FILTERING_SUMMARY_SIMPLE"),
      Effect.annotateLogs("skippedValidation", skippedValidation),
      Effect.annotateLogs("skippedNotStarted", skippedNotStarted),
    );
  }

  yield* Effect.logInfo("Mapped users to teams (simple)").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "USERS_MAPPED_SIMPLE"),
    Effect.annotateLogs("userCount", result.size),
    Effect.annotateLogs("totalTeams", teamsSnapshot.size - skippedValidation - skippedNotStarted),
  );

  return result;
});

/**
 * Maps users to their active teams from a Firestore snapshot.
 * Validates each team document against the schema and applies eligibility filtering.
 *
 * A team is eligible for lineup setting if:
 * 1. Its schema is valid
 * 2. Its start_date has passed
 * 3. It is not paused today
 * 4. Its weekly_deadline matches today or is empty/intraday
 * 5. Either:
 *    a. Its lineup has NOT been set today (last_updated not today), OR
 *    b. Its league has a game starting in the next hour
 * 6. It has not exceeded the daily failure limit
 */
export const mapUsersToActiveTeams = Effect.fn("scheduling.mapUsersToActiveTeams")(function* (
  teamsSnapshot: QuerySnapshot<DocumentData>,
  scheduleInfo: ScheduleInfo,
) {
  if (teamsSnapshot.size === 0) {
    yield* Effect.logDebug("No teams in snapshot").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "EMPTY_TEAMS_SNAPSHOT"),
    );
    return new Map<string, FirestoreTeamPayload[]>();
  }

  const now = Date.now();
  const todayDateString = todayPacific();
  const todayStartMs = getPacificStartOfDay(todayDateString);
  const currentDayOfWeek = getCurrentPacificNumDay();

  // Build a lookup for which leagues have games in the next hour
  const leagueHasGameNextHour = new Map<string, boolean>();
  for (const leagueInfo of scheduleInfo.leagues) {
    leagueHasGameNextHour.set(leagueInfo.league, leagueInfo.hasGameNextHour);
  }

  const result = new Map<string, FirestoreTeamPayload[]>();
  let skippedValidation = 0;
  let skippedPaused = 0;
  let skippedWeeklyDeadline = 0;
  let skippedAlreadySetToday = 0;
  let skippedFailureLimit = 0;
  let skippedNotStarted = 0;

  for (const doc of teamsSnapshot?.docs ?? []) {
    const rawData = doc.data();
    const dataWithKey = { ...rawData, team_key: doc.id };

    // Step 1: Validate schema
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
      skippedValidation++;
      continue;
    }

    const team = parseResult.right;
    const uid = team.uid;

    // Step 2: Check if team has started
    if (team.start_date > now) {
      skippedNotStarted++;
      continue;
    }

    // Step 3: Check if team is paused today
    if (isTodayPacific(team.lineup_paused_at)) {
      skippedPaused++;
      continue;
    }

    // Step 4: Check weekly deadline matches today
    // Valid deadlines: empty string, "intraday", or matches current day of week
    const validDeadlines = ["", "intraday", currentDayOfWeek.toString()];
    if (!validDeadlines.includes(team.weekly_deadline)) {
      skippedWeeklyDeadline++;
      continue;
    }

    // Step 5: Check eligibility based on last-set-today OR next-hour game
    // We use last_updated as the proxy for "lineup last set" since it's updated on successful lineup sets
    const lastUpdatedAt = team.last_updated ?? -1;
    const lastSetIsToday = lastUpdatedAt >= todayStartMs;
    const hasGameNextHour = leagueHasGameNextHour.get(team.game_code) ?? false;

    // Team is eligible if NOT set today, OR if there's a game in the next hour
    if (lastSetIsToday && !hasGameNextHour) {
      skippedAlreadySetToday++;
      continue;
    }

    // Step 6: Check failure limit
    const failureCount = team.lineup_failure_count ?? 0;
    const lastFailureAt = team.last_lineup_failure_at ?? -1;
    const failureIsToday = lastFailureAt >= todayStartMs;

    if (failureIsToday && failureCount >= MAX_DAILY_FAILURES) {
      skippedFailureLimit++;
      continue;
    }

    // Team passes all filters - add to result
    const userTeams = result.get(uid);
    if (userTeams === undefined) {
      result.set(uid, [team]);
    } else {
      userTeams.push(team);
    }
  }

  // Log filtering summary
  const totalSkipped =
    skippedValidation +
    skippedPaused +
    skippedWeeklyDeadline +
    skippedAlreadySetToday +
    skippedFailureLimit +
    skippedNotStarted;

  if (totalSkipped > 0) {
    yield* Effect.logInfo("Team filtering summary").pipe(
      Effect.annotateLogs("phase", "scheduling"),
      Effect.annotateLogs("event", "TEAM_FILTERING_SUMMARY"),
      Effect.annotateLogs("skippedValidation", skippedValidation),
      Effect.annotateLogs("skippedPaused", skippedPaused),
      Effect.annotateLogs("skippedWeeklyDeadline", skippedWeeklyDeadline),
      Effect.annotateLogs("skippedAlreadySetToday", skippedAlreadySetToday),
      Effect.annotateLogs("skippedFailureLimit", skippedFailureLimit),
      Effect.annotateLogs("skippedNotStarted", skippedNotStarted),
      Effect.annotateLogs("totalSkipped", totalSkipped),
    );
  }

  yield* Effect.logInfo("Mapped users to active teams").pipe(
    Effect.annotateLogs("phase", "scheduling"),
    Effect.annotateLogs("event", "USERS_MAPPED"),
    Effect.annotateLogs("userCount", result.size),
    Effect.annotateLogs("eligibleTeams", teamsSnapshot.size - totalSkipped),
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
