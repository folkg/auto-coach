import type { Leagues } from "@common/types/Leagues.js";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";

import { Context, Effect, Fiber, Layer, Schema } from "effect";

import type {
  CalcPositionalScarcityRequest as CalcPositionalScarcityRequestType,
  DispatchResponse,
  SetLineupRequest as SetLineupRequestType,
  WeeklyTransactionsRequest as WeeklyTransactionsRequestType,
} from "../types/api-schemas";

import { getActiveTeamsForLeagues } from "../../../core/src/common/services/firebase/firestore.service.js";
import { getCurrentPacificHour } from "../../../core/src/common/services/utilities.service.js";
import {
  type PositionalScarcityError,
  recalculateScarcityOffsetsForAll,
} from "./positional-scarcity.service";
import {
  enqueueUsersTeams,
  type FirestoreTeamPayload,
  leaguesToSetLineupsFor,
  mapUsersToActiveTeams,
  type SchedulingError,
  setStartingPlayersForToday,
  setTodaysPostponedTeams,
} from "./scheduling.service";
import {
  scheduleWeeklyLeagueTransactions,
  type WeeklyTransactionsError,
} from "./weekly-transactions.service";

export class DispatchError extends Schema.TaggedError<DispatchError>()("DispatchError", {
  message: Schema.String,
}) {}

export type DispatchServiceError =
  | DispatchError
  | SchedulingError
  | WeeklyTransactionsError
  | PositionalScarcityError;

/**
 * Service for getting the current Pacific time hour.
 * Abstracted for testability.
 */
export class TimeService extends Context.Tag("TimeService")<
  TimeService,
  {
    readonly getCurrentPacificHour: () => number;
  }
>() {
  static readonly live = Layer.succeed(TimeService, {
    getCurrentPacificHour,
  });
}

/**
 * Service for scheduling operations (leagues, teams, tasks).
 * Abstracted for testability.
 */
export class SchedulingService extends Context.Tag("SchedulingService")<
  SchedulingService,
  {
    readonly leaguesToSetLineupsFor: () => Effect.Effect<readonly Leagues[], SchedulingError>;
    readonly setTodaysPostponedTeams: (
      leagues: readonly Leagues[],
    ) => Effect.Effect<void, SchedulingError>;
    readonly setStartingPlayersForToday: (
      teamsSnapshot: QuerySnapshot<DocumentData>,
    ) => Effect.Effect<void, SchedulingError>;
    readonly mapUsersToActiveTeams: (
      teamsSnapshot: QuerySnapshot<DocumentData>,
    ) => Effect.Effect<Map<string, FirestoreTeamPayload[]>, never>;
    readonly enqueueUsersTeams: (
      activeUsers: Map<string, FirestoreTeamPayload[]>,
      queueName: string,
    ) => Effect.Effect<readonly { readonly uid: string }[], SchedulingError>;
  }
>() {
  static readonly live = Layer.succeed(SchedulingService, {
    leaguesToSetLineupsFor,
    setTodaysPostponedTeams,
    setStartingPlayersForToday,
    mapUsersToActiveTeams,
    enqueueUsersTeams,
  });
}

/**
 * Service for Firestore operations.
 * Abstracted for testability.
 */
export class FirestoreService extends Context.Tag("FirestoreService")<
  FirestoreService,
  {
    readonly getActiveTeamsForLeagues: (leagues: Leagues[]) => Promise<QuerySnapshot<DocumentData>>;
  }
>() {
  static readonly live = Layer.succeed(FirestoreService, {
    getActiveTeamsForLeagues,
  });
}

/**
 * Service for weekly transactions.
 * Abstracted for testability.
 */
export class WeeklyTransactionsService extends Context.Tag("WeeklyTransactionsService")<
  WeeklyTransactionsService,
  {
    readonly scheduleWeeklyLeagueTransactions: () => Effect.Effect<void, WeeklyTransactionsError>;
  }
>() {
  static readonly live = Layer.succeed(WeeklyTransactionsService, {
    scheduleWeeklyLeagueTransactions,
  });
}

/**
 * Service for positional scarcity calculations.
 * Abstracted for testability.
 */
export class PositionalScarcityService extends Context.Tag("PositionalScarcityService")<
  PositionalScarcityService,
  {
    readonly recalculateScarcityOffsetsForAll: () => Effect.Effect<void, PositionalScarcityError>;
  }
>() {
  static readonly live = Layer.succeed(PositionalScarcityService, {
    recalculateScarcityOffsetsForAll,
  });
}

export interface DispatchService {
  dispatchSetLineup(
    request: SetLineupRequestType,
  ): Effect.Effect<
    DispatchResponse,
    DispatchServiceError,
    TimeService | SchedulingService | FirestoreService
  >;
  dispatchWeeklyTransactions(
    request: WeeklyTransactionsRequestType,
  ): Effect.Effect<DispatchResponse, DispatchServiceError, WeeklyTransactionsService>;
  dispatchCalcPositionalScarcity(
    request: CalcPositionalScarcityRequestType,
  ): Effect.Effect<DispatchResponse, DispatchServiceError, PositionalScarcityService>;
}

export class DispatchServiceImpl implements DispatchService {
  dispatchSetLineup(
    _request: SetLineupRequestType,
  ): Effect.Effect<
    DispatchResponse,
    DispatchServiceError,
    TimeService | SchedulingService | FirestoreService
  > {
    return Effect.gen(function* () {
      const timeService = yield* TimeService;
      const schedulingService = yield* SchedulingService;
      const firestoreService = yield* FirestoreService;

      // Step 1: Check if current Pacific hour > 0 (skip midnight run)
      const currentHour = timeService.getCurrentPacificHour();
      if (currentHour === 0) {
        return {
          success: true,
          taskCount: 0,
          message: "Skipping midnight run (hour 0)",
        };
      }

      // Step 2: Determine active leagues - let Effect fail naturally
      const leagues = yield* schedulingService.leaguesToSetLineupsFor();

      // Step 3: If no leagues, return early
      if (leagues.length === 0) {
        return {
          success: true,
          taskCount: 0,
          message: "No leagues with games starting soon",
        };
      }

      // Step 4: Start parallel: setTodaysPostponedTeams()
      const postponedTeamsFiber = yield* Effect.fork(
        schedulingService
          .setTodaysPostponedTeams(leagues)
          .pipe(
            Effect.catchAll((error: SchedulingError) =>
              Effect.logError(`Failed to set postponed teams: ${error.message}`),
            ),
          ),
      );

      // Step 5: Fetch active teams from Firestore
      const teamsSnapshot: QuerySnapshot<DocumentData> = yield* Effect.tryPromise({
        try: () => firestoreService.getActiveTeamsForLeagues([...leagues]),
        catch: (error: unknown) =>
          new DispatchError({
            message: `Failed to fetch teams from Firebase for Leagues: ${leagues.join(", ")}: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

      // Step 6: Start parallel: setStartingPlayersForToday(teamsSnapshot)
      const startingPlayersFiber = yield* Effect.fork(
        schedulingService
          .setStartingPlayersForToday(teamsSnapshot)
          .pipe(
            Effect.catchAll((error: SchedulingError) =>
              Effect.logError(`Failed to set starting players: ${error.message}`),
            ),
          ),
      );

      // Step 7: Call mapUsersToActiveTeams(teamsSnapshot) - now an Effect with validation
      const activeUsers = yield* schedulingService.mapUsersToActiveTeams(teamsSnapshot);

      if (activeUsers.size === 0) {
        return {
          success: true,
          taskCount: 0,
          message: "No active users to set lineups for",
        };
      }

      // Step 8: Wait for parallel operations to complete
      yield* Effect.all([Fiber.join(postponedTeamsFiber), Fiber.join(startingPlayersFiber)]);

      // Step 9: Enqueue tasks - let Effect fail naturally
      const queueName = process.env.CLOUD_TASKS_QUEUE_PATH ?? "mutation-queue-prod";
      const enqueuedTasks = yield* schedulingService.enqueueUsersTeams(activeUsers, queueName);

      // Step 10: Return success with count of tasks created
      return {
        success: true,
        taskCount: enqueuedTasks.length,
        message: `Successfully enqueued ${enqueuedTasks.length} set lineup tasks for leagues: ${leagues.join(", ")}`,
      };
    });
  }

  dispatchWeeklyTransactions(
    _request: WeeklyTransactionsRequestType,
  ): Effect.Effect<DispatchResponse, DispatchServiceError, WeeklyTransactionsService> {
    return Effect.gen(function* () {
      const weeklyTransactionsService = yield* WeeklyTransactionsService;

      yield* weeklyTransactionsService.scheduleWeeklyLeagueTransactions();

      return {
        success: true,
        taskCount: 0,
        message: "Weekly transactions scheduled successfully",
      };
    });
  }

  dispatchCalcPositionalScarcity(
    request: CalcPositionalScarcityRequestType,
  ): Effect.Effect<DispatchResponse, DispatchServiceError, PositionalScarcityService> {
    return Effect.gen(function* () {
      const positionalScarcityService = yield* PositionalScarcityService;

      yield* positionalScarcityService.recalculateScarcityOffsetsForAll();

      return {
        success: true,
        taskCount: 1,
        message: `Positional scarcity calculation completed for league: ${request.leagueKey}`,
      };
    });
  }
}

/**
 * Live layer that combines all dependencies for production use.
 */
export const DispatchServiceLive = Layer.mergeAll(
  TimeService.live,
  SchedulingService.live,
  FirestoreService.live,
  WeeklyTransactionsService.live,
  PositionalScarcityService.live,
);
