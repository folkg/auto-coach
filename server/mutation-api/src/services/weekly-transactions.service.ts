import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";
import { Effect, Schema } from "effect";
import type { FirestoreTeam } from "@common/types/team.js";
import { getTomorrowsActiveWeeklyTeams } from "../../../core/src/common/services/firebase/firestore.service.js";
import { getTopAvailablePlayers } from "../../../core/src/transactions/services/processTransactions.service.js";
import { enqueueUsersTeams, mapUsersToActiveTeams } from "./scheduling.service.js";
import { processTomorrowsTransactions } from "./set-lineup.service.js";

export class WeeklyTransactionsError extends Schema.TaggedError<WeeklyTransactionsError>()(
  "WeeklyTransactionsError",
  {
    message: Schema.String,
    uid: Schema.optional(Schema.String),
    error: Schema.optional(Schema.Defect),
  },
) {}

/**
 * Schedules weekly league transactions for all users with teams that have
 * a weekly deadline matching tomorrow.
 *
 * This fetches teams from Firestore, groups them by user, and enqueues
 * Cloud Tasks for processing each user's teams.
 */
export const scheduleWeeklyLeagueTransactions = Effect.fn(
  "weeklyTransactions.scheduleWeeklyLeagueTransactions",
)(function* () {
  // Step 1: Fetch teams with tomorrow's weekly deadline
  const teamsSnapshot: QuerySnapshot<DocumentData> = yield* Effect.tryPromise({
    try: () => getTomorrowsActiveWeeklyTeams(),
    catch: (error) =>
      WeeklyTransactionsError.make({
        message: "Failed to fetch weekly teams from Firestore",
        error,
      }),
  });

  // Step 2: Map users to their active teams
  const activeUsers = mapUsersToActiveTeams(teamsSnapshot);

  if (activeUsers.size === 0) {
    yield* Effect.logInfo("No users to process weekly transactions for");
    return;
  }

  // Step 3: Enqueue tasks for each user
  const queueName = "weekly-transactions-queue";
  yield* enqueueUsersTeams(activeUsers, queueName).pipe(
    Effect.mapError((schedulingError) =>
      WeeklyTransactionsError.make({
        message: "Failed to enqueue weekly transactions",
        error: schedulingError,
      }),
    ),
  );

  yield* Effect.logInfo(
    `Successfully enqueued weekly transaction tasks for ${activeUsers.size} users`,
  );
});

/**
 * Performs weekly league transactions for a specific user's teams.
 *
 * This fetches top available players and processes tomorrow's transactions
 * for all provided teams.
 */
export const performWeeklyLeagueTransactions = Effect.fn(
  "weeklyTransactions.performWeeklyLeagueTransactions",
)(function* (uid: string, firestoreTeams: readonly FirestoreTeam[]) {
  if (!uid) {
    return yield* WeeklyTransactionsError.make({ message: "No uid provided" });
  }

  if (!firestoreTeams) {
    return yield* WeeklyTransactionsError.make({ message: "No teams provided", uid });
  }

  if (firestoreTeams.length === 0) {
    yield* Effect.logInfo(`No weekly teams for user ${uid}`);
    return;
  }

  // Step 1: Fetch top available players for all teams
  const topAvailablePlayerCandidates = yield* Effect.tryPromise({
    try: () => getTopAvailablePlayers([...firestoreTeams], uid),
    catch: (error) =>
      WeeklyTransactionsError.make({
        message: "Failed to get top available players",
        uid,
        error,
      }),
  });

  // Step 2: Process tomorrow's transactions
  yield* processTomorrowsTransactions(
    firestoreTeams,
    firestoreTeams,
    uid,
    topAvailablePlayerCandidates,
  ).pipe(
    Effect.mapError((setLineupError) =>
      WeeklyTransactionsError.make({
        message: "Failed to process tomorrow's transactions",
        uid,
        error: setLineupError,
      }),
    ),
  );
});
