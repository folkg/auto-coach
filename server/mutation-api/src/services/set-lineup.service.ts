import type { FirestoreTeam, TeamOptimizer } from "@common/types/team.js";
import type { LineupChanges, PlayerTransaction } from "@common/types/transactions.js";

import { Data, Effect } from "effect";

import type { TopAvailablePlayers } from "../../../core/src/common/services/yahooAPI/yahooTopAvailablePlayersBuilder.service.js";

import {
  getTodaysPostponedTeams,
  updateFirestoreTimestamp,
} from "../../../core/src/common/services/firebase/firestore.service.js";
import {
  enrichTeamsWithFirestoreSettings,
  patchTeamChangesInFirestore,
} from "../../../core/src/common/services/firebase/firestoreUtils.service.js";
import {
  getCurrentPacificNumDay,
  getPacificTimeDateString,
  isTodayPacific,
} from "../../../core/src/common/services/utilities.service.js";
import { putLineupChanges } from "../../../core/src/common/services/yahooAPI/yahooAPI.service.js";
import { fetchRostersFromYahoo } from "../../../core/src/common/services/yahooAPI/yahooLineupBuilder.service.js";
import {
  initStartingGoalies,
  initStartingPitchers,
} from "../../../core/src/common/services/yahooAPI/yahooStartingPlayer.service.js";
import { LineupOptimizer } from "../../../core/src/dispatchSetLineup/classes/LineupOptimizer.js";
import { isFirstRunOfTheDay } from "../../../core/src/scheduleSetLineup/services/scheduleSetLineup.service.js";
import {
  createPlayersTransactions,
  getTopAvailablePlayers,
  postTransactions,
  sendPotentialTransactionEmail,
} from "../../../core/src/transactions/services/processTransactions.service.js";

export class SetLineupError extends Data.TaggedError("SetLineupError")<{
  readonly message: string;
  readonly uid?: string;
}> {}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Sets lineup for all of a user's active (non-paused) teams
 */
export function setUsersLineup(
  uid: string,
  firestoreTeams: readonly FirestoreTeam[],
): Effect.Effect<void, SetLineupError> {
  return Effect.gen(function* () {
    if (!uid) {
      return yield* Effect.fail(new SetLineupError({ message: "No uid provided" }));
    }
    if (!firestoreTeams) {
      return yield* Effect.fail(new SetLineupError({ message: "No teams provided", uid }));
    }

    // Step 1: Filter paused teams
    const firestoreTeamsToSet = filterPausedTeams(firestoreTeams);

    if (firestoreTeamsToSet.length === 0) {
      return;
    }

    // Step 2: Start parallel initialization of top available players and starting players
    const topAvailablePlayersEffect = Effect.tryPromise({
      try: () => getTopAvailablePlayers(firestoreTeamsToSet, uid),
      catch: (error: unknown) =>
        new SetLineupError({
          message: `Failed to get top available players: ${toErrorMessage(error)}`,
          uid,
        }),
    });

    const initStartingPlayersEffect = initializeGlobalStartingPlayers(firestoreTeamsToSet);

    // Step 3: Get postponed teams
    const postponedTeams = yield* initializePostponedTeams();

    // Step 4: Fetch rosters from Yahoo
    let usersTeams: readonly TeamOptimizer[] = yield* Effect.tryPromise({
      try: () =>
        fetchRostersFromYahoo(
          firestoreTeamsToSet.map((t) => t.team_key),
          uid,
          "",
          postponedTeams,
        ),
      catch: (error: unknown) =>
        new SetLineupError({
          message: `Failed to fetch rosters from Yahoo: ${toErrorMessage(error)}`,
          uid,
        }),
    });

    if (usersTeams.length === 0) {
      return;
    }

    // Step 5: Enrich with Firestore settings
    usersTeams = enrichTeamsWithFirestoreSettings(usersTeams, firestoreTeamsToSet);

    // Step 6: Patch changes to Firestore (fire-and-forget)
    Effect.runFork(
      Effect.tryPromise({
        try: () => patchTeamChangesInFirestore(usersTeams, firestoreTeamsToSet),
        catch: (error: unknown) =>
          new SetLineupError({
            message: `Failed to patch team changes: ${toErrorMessage(error)}`,
            uid,
          }),
      }).pipe(Effect.catchAll(() => Effect.void)),
    );

    // Step 7: Process INTRADAY transactions (drops -> lineup changes -> adds)
    const topAvailablePlayerCandidates = yield* topAvailablePlayersEffect;
    usersTeams = yield* processTransactionsForIntradayTeams(
      usersTeams,
      firestoreTeamsToSet,
      topAvailablePlayerCandidates,
      uid,
      postponedTeams,
    );

    // Step 8: Wait for starting players initialization
    yield* initStartingPlayersEffect;

    // Step 9: Process LINEUP optimization
    usersTeams = yield* processLineupChanges(usersTeams, uid);

    // Step 10: Process NEXT DAY transactions
    yield* processTransactionsForNextDayTeams(
      usersTeams,
      firestoreTeamsToSet,
      topAvailablePlayerCandidates,
      uid,
    );
  });
}

/**
 * Runs lineup optimizer and posts changes to Yahoo
 */
export function processLineupChanges(
  teams: readonly TeamOptimizer[],
  uid: string,
): Effect.Effect<TeamOptimizer[], SetLineupError> {
  return Effect.gen(function* () {
    const result: TeamOptimizer[] = [];
    const allLineupChanges: LineupChanges[] = [];
    const teamsToUpdateTimestamp: string[] = [];

    for (const team of teams) {
      const lo = new LineupOptimizer(team);
      lo.optimizeStartingLineup();

      const lineupChanges = lo.lineupChanges;
      if (lineupChanges && lo.shouldPostLineupChanges()) {
        allLineupChanges.push(lineupChanges);
      } else if (lineupChanges && !lo.shouldPostLineupChanges()) {
        teamsToUpdateTimestamp.push(team.team_key);
      } else if (!lineupChanges) {
        teamsToUpdateTimestamp.push(team.team_key);
      }

      result.push(lo.getCurrentTeamState());
    }

    if (allLineupChanges.length > 0) {
      yield* Effect.tryPromise({
        try: () => putLineupChanges(allLineupChanges, uid),
        catch: (error: unknown) =>
          new SetLineupError({
            message: `Failed to put lineup changes: ${toErrorMessage(error)}`,
            uid,
          }),
      });
    }

    yield* Effect.forEach(
      teamsToUpdateTimestamp,
      (teamKey: string) =>
        Effect.tryPromise({
          try: () => updateFirestoreTimestamp(uid, teamKey),
          catch: (error: unknown) =>
            new SetLineupError({
              message: `Failed to update timestamp for ${teamKey}: ${toErrorMessage(error)}`,
              uid,
            }),
        }),
      { concurrency: "unbounded" },
    );

    return result;
  });
}

/**
 * Handles same-day transactions for intraday teams
 */
export function processTransactionsForIntradayTeams(
  originalTeams: readonly TeamOptimizer[],
  firestoreTeams: readonly FirestoreTeam[],
  topAvailablePlayerCandidates: TopAvailablePlayers,
  uid: string,
  postponedTeams: Set<string>,
): Effect.Effect<readonly TeamOptimizer[], SetLineupError> {
  return Effect.gen(function* () {
    const teams = getTeamsWithSameDayTransactions(originalTeams);

    yield* processManualTransactions(teams, topAvailablePlayerCandidates, uid);

    let result: readonly TeamOptimizer[] = originalTeams;

    const transactionsCompleted = yield* processAutomaticTransactions(
      teams,
      topAvailablePlayerCandidates,
      uid,
    );

    if (transactionsCompleted) {
      const teamKeys = originalTeams.map((t) => t.team_key);
      result = yield* Effect.tryPromise({
        try: () => fetchRostersFromYahoo(teamKeys, uid, "", postponedTeams),
        catch: (error: unknown) =>
          new SetLineupError({
            message: `Failed to re-fetch rosters: ${toErrorMessage(error)}`,
            uid,
          }),
      });
      result = enrichTeamsWithFirestoreSettings(result, firestoreTeams);
    }

    return result;
  });
}

/**
 * Handles next-day transactions
 */
export function processTransactionsForNextDayTeams(
  originalTeams: readonly TeamOptimizer[],
  firestoreTeams: readonly FirestoreTeam[],
  topAvailablePlayerCandidates: TopAvailablePlayers,
  uid: string,
): Effect.Effect<void, SetLineupError> {
  return Effect.gen(function* () {
    const teams = getTeamsForNextDayTransactions(originalTeams);

    // Pre-check to see if we need to do anything using today's roster
    const { dropPlayerTransactions: potentialDrops, addSwapTransactions: potentialAddSwaps } =
      yield* Effect.tryPromise({
        try: () => createPlayersTransactions([...teams], topAvailablePlayerCandidates),
        catch: (error: unknown) =>
          new SetLineupError({
            message: `Failed to create player transactions: ${toErrorMessage(error)}`,
            uid,
          }),
      });

    if (!(potentialDrops || potentialAddSwaps)) {
      return;
    }

    yield* processTomorrowsTransactions(teams, firestoreTeams, uid, topAvailablePlayerCandidates);
  });
}

/**
 * Fetches tomorrow's roster and processes transactions
 */
export function processTomorrowsTransactions(
  teams: readonly TeamOptimizer[] | readonly FirestoreTeam[],
  firestoreTeams: readonly FirestoreTeam[],
  uid: string,
  topAvailablePlayerCandidates: TopAvailablePlayers,
): Effect.Effect<void, SetLineupError> {
  return Effect.gen(function* () {
    const teamKeys = teams.map((t) => t.team_key);

    let tomorrowsTeams = yield* Effect.tryPromise({
      try: () => fetchRostersFromYahoo(teamKeys, uid, tomorrowsDateAsString()),
      catch: (error: unknown) =>
        new SetLineupError({
          message: `Failed to fetch tomorrow's rosters: ${toErrorMessage(error)}`,
          uid,
        }),
    });

    tomorrowsTeams = enrichTeamsWithFirestoreSettings(tomorrowsTeams, firestoreTeams);

    yield* Effect.all(
      [
        processManualTransactions(tomorrowsTeams, topAvailablePlayerCandidates, uid),
        processAutomaticTransactions(tomorrowsTeams, topAvailablePlayerCandidates, uid),
      ],
      { concurrency: "unbounded" },
    );
  });
}

/**
 * Auto transactions for teams with automated_transaction_processing enabled
 */
export function processAutomaticTransactions(
  teams: readonly TeamOptimizer[],
  topAvailablePlayerCandidates: TopAvailablePlayers,
  uid: string,
): Effect.Effect<boolean, SetLineupError> {
  return Effect.gen(function* () {
    const teamsWithAutoTransactions = teams.filter((t) => t.automated_transaction_processing);

    if (teamsWithAutoTransactions.length === 0) {
      return false;
    }

    const { dropPlayerTransactions, lineupChanges, addSwapTransactions } = yield* Effect.tryPromise(
      {
        try: () =>
          createPlayersTransactions([...teamsWithAutoTransactions], topAvailablePlayerCandidates),
        catch: (error: unknown) =>
          new SetLineupError({
            message: `Failed to create transactions: ${toErrorMessage(error)}`,
            uid,
          }),
      },
    );

    const transactionData = {
      dropPlayerTransactions,
      lineupChanges,
      addSwapTransactions,
    };

    const result = yield* Effect.tryPromise({
      try: () => postTransactions(transactionData, uid),
      catch: (error: unknown) =>
        new SetLineupError({
          message: `Failed to post transactions: ${toErrorMessage(error)}`,
          uid,
        }),
    });

    return result.success;
  });
}

/**
 * Sends emails for manual teams (first run only)
 */
export function processManualTransactions(
  teams: readonly TeamOptimizer[],
  topAvailablePlayerCandidates: TopAvailablePlayers,
  uid: string,
): Effect.Effect<void, SetLineupError> {
  return Effect.gen(function* () {
    // Only process teams on the first run of the day
    const teamsToCheck = teams.filter(
      (t) => !t.automated_transaction_processing && isFirstRunOfTheDay(),
    );

    if (teamsToCheck.length === 0) {
      return;
    }

    const { dropPlayerTransactions, addSwapTransactions } = yield* Effect.tryPromise({
      try: () => createPlayersTransactions([...teamsToCheck], topAvailablePlayerCandidates),
      catch: (error: unknown) =>
        new SetLineupError({
          message: `Failed to create manual transactions: ${toErrorMessage(error)}`,
          uid,
        }),
    });

    const proposedTransactions: PlayerTransaction[] = (dropPlayerTransactions ?? [])
      .concat(addSwapTransactions ?? [])
      .flat();

    if (proposedTransactions.length > 0) {
      sendPotentialTransactionEmail(proposedTransactions, uid);
    }
  });
}

/**
 * Initialize starting goalies/pitchers based on team types
 */
export function initializeGlobalStartingPlayers(
  firestoreTeams: readonly FirestoreTeam[],
): Effect.Effect<void, SetLineupError> {
  return Effect.gen(function* () {
    const hasNHLTeam = firestoreTeams.some((team) => team.game_code === "nhl");
    const hasMLBTeam = firestoreTeams.some((team) => team.game_code === "mlb");

    const effects: Effect.Effect<void, SetLineupError>[] = [];

    if (hasNHLTeam) {
      effects.push(
        Effect.tryPromise({
          try: () => initStartingGoalies(),
          catch: (error: unknown) =>
            new SetLineupError({
              message: `Failed to init starting goalies: ${toErrorMessage(error)}`,
            }),
        }),
      );
    }

    if (hasMLBTeam) {
      effects.push(
        Effect.tryPromise({
          try: () => initStartingPitchers(),
          catch: (error: unknown) =>
            new SetLineupError({
              message: `Failed to init starting pitchers: ${toErrorMessage(error)}`,
            }),
        }),
      );
    }

    if (effects.length > 0) {
      yield* Effect.all(effects, { concurrency: "unbounded" });
    }
  });
}

let _postponedTeams: Set<string> | undefined;

/**
 * Get today's postponed games (cached)
 */
export function initializePostponedTeams(): Effect.Effect<Set<string>, SetLineupError> {
  if (_postponedTeams) {
    return Effect.succeed(_postponedTeams);
  }

  return Effect.tryPromise({
    try: async () => {
      _postponedTeams = (await getTodaysPostponedTeams()) ?? new Set();
      return _postponedTeams;
    },
    catch: (error: unknown) =>
      new SetLineupError({
        message: `Failed to get postponed teams: ${toErrorMessage(error)}`,
      }),
  });
}

/**
 * Reset cached postponed teams (useful for testing)
 */
export function resetPostponedTeamsCache(): void {
  _postponedTeams = undefined;
}

/**
 * Filter teams with intraday transactions capability
 */
export function getTeamsWithSameDayTransactions(teams: readonly TeamOptimizer[]): TeamOptimizer[] {
  return teams.filter(
    (team) =>
      (team.allow_adding || team.allow_dropping || team.allow_add_drops) &&
      (team.weekly_deadline === "intraday" || team.game_code === "nfl"),
  );
}

/**
 * Filter teams for next-day transactions
 */
export function getTeamsForNextDayTransactions(teams: readonly TeamOptimizer[]): TeamOptimizer[] {
  return teams.filter(
    (team) =>
      (team.allow_adding || team.allow_dropping || team.allow_add_drops) &&
      (team.weekly_deadline === "" ||
        team.weekly_deadline === (getCurrentPacificNumDay() + 1).toString()) &&
      team.game_code !== "nfl",
  );
}

/**
 * Helper for tomorrow's date string
 */
export function tomorrowsDateAsString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getPacificTimeDateString(tomorrow);
}

/**
 * Filter out paused teams (paused today)
 */
function filterPausedTeams(firestoreTeams: readonly FirestoreTeam[]): FirestoreTeam[] {
  const isNotPaused = (team: FirestoreTeam) => !isTodayPacific(team.lineup_paused_at);

  return firestoreTeams.filter(isNotPaused);
}
