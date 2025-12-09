import { Effect, Schema } from "effect";

import { db } from "../../../core/src/common/services/firebase/firestore.service.js";
import {
  getTopPlayersGeneral,
  refreshYahooAccessToken,
} from "../../../core/src/common/services/yahooAPI/yahooAPI.service.js";

export class UserProcessorError extends Schema.TaggedError<UserProcessorError>()(
  "UserProcessorError",
  {
    message: Schema.String,
    error: Schema.optional(Schema.Defect),
  },
) {}

export interface UserProcessingOptions {
  readonly concurrency: number;
  readonly batchSize: number;
  readonly filter?: (user: UserDocument) => boolean;
}

interface UserDocument {
  uid: string;
  accessToken?: string;
  refreshToken?: string;
  isActive?: boolean;
  leagues?: Array<{
    game_code: string;
    league_key: string;
  }>;
}

export class UserProcessorService {
  private readonly defaultOptions: UserProcessingOptions = {
    concurrency: 5,
    batchSize: 100,
  };

  /**
   * Fetches users from Firestore and returns them as a stream.
   */
  fetchUsers(
    options: Partial<UserProcessingOptions> = {},
  ): Effect.Effect<readonly UserDocument[], UserProcessorError> {
    const opts = { ...this.defaultOptions, ...options };

    return Effect.tryPromise({
      try: async () => {
        // Get users from Firestore
        const usersSnapshot = await db.collection("users").get();
        const users = usersSnapshot.docs.map((doc) => doc.data() as UserDocument);

        // Apply filter if provided
        return opts.filter ? users.filter(opts.filter) : users;
      },
      catch: (error) =>
        UserProcessorError.make({
          message: "Failed to fetch users",
          error,
        }),
    });
  }

  /**
   * Processes users with bounded concurrency.
   * Uses Effect.forEach with concurrency option for proper bounded processing.
   */
  processUsersWithBoundedConcurrency(
    options: Partial<UserProcessingOptions> = {},
  ): Effect.Effect<void, UserProcessorError> {
    const opts = { ...this.defaultOptions, ...options };
    const processUser = this.processUserForMutations.bind(this);

    return Effect.gen(function* () {
      const users = yield* Effect.tryPromise({
        try: async () => {
          const usersSnapshot = await db.collection("users").get();
          const allUsers = usersSnapshot.docs.map((doc) => doc.data() as UserDocument);
          return opts.filter ? allUsers.filter(opts.filter) : allUsers;
        },
        catch: (error) =>
          UserProcessorError.make({
            message: "Failed to fetch users",
            error,
          }),
      });

      yield* Effect.forEach(users, processUser, { concurrency: opts.concurrency });
    });
  }

  processUserForMutations(user: UserDocument): Effect.Effect<void, UserProcessorError> {
    return Effect.tryPromise({
      try: async () => {
        // Refresh Yahoo access token if needed
        if (user.refreshToken) {
          await refreshYahooAccessToken(user.refreshToken);
        }

        // Get user's teams
        const teamsSnapshot = await db.collection("users").doc(user.uid).collection("teams").get();

        // Process each team
        for (const teamDoc of teamsSnapshot.docs) {
          const team = teamDoc.data();

          // Get available players for add candidates
          if (team.game_code && user.accessToken) {
            await getTopPlayersGeneral(user.uid, team.game_code, "ALL", 0);
          }
        }
      },
      catch: (error) =>
        UserProcessorError.make({
          message: `Failed to process user ${user.uid}`,
          error,
        }),
    });
  }

  createScheduledUserProcessor(
    options: Partial<UserProcessingOptions> = {},
  ): Effect.Effect<void, UserProcessorError> {
    return this.processUsersWithBoundedConcurrency(options);
  }

  // Helper method to filter active users
  filterActiveUsers(user: UserDocument): boolean {
    return Boolean(user.accessToken && user.refreshToken && user.isActive !== false);
  }

  // Helper method to filter users by league
  filterUsersByLeague(gameCode: string) {
    return (user: UserDocument): boolean => {
      return (
        this.filterActiveUsers(user) &&
        Boolean(user.leagues?.some((league) => league.game_code === gameCode))
      );
    };
  }
}
