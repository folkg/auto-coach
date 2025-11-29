import { Effect, Stream } from "effect";
import { db } from "../../../core/src/common/services/firebase/firestore.service.js";
import {
  getTopPlayersGeneral,
  refreshYahooAccessToken,
} from "../../../core/src/common/services/yahooAPI/yahooAPI.service.js";

export interface UserProcessorError {
  readonly _tag: "UserProcessorError";
  readonly message: string;
}

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

  processUsersWithBoundedConcurrency(
    options: Partial<UserProcessingOptions> = {},
  ): Stream.Stream<UserDocument, UserProcessorError> {
    const opts = { ...this.defaultOptions, ...options };

    return Stream.fromEffect(
      Effect.tryPromise({
        try: async () => {
          // Get users from Firestore
          const usersSnapshot = await db.collection("users").get();
          const users = usersSnapshot.docs.map((doc) => doc.data() as UserDocument);

          // Apply filter if provided
          const filteredUsers = opts.filter ? users.filter(opts.filter) : users;

          return filteredUsers;
        },
        catch: (error) => ({
          _tag: "UserProcessorError" as const,
          message: `Failed to fetch users: ${error instanceof Error ? error.message : String(error)}`,
        }),
      }),
    ).pipe(Stream.flatMap(Stream.fromIterable));
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
      catch: (error) => ({
        _tag: "UserProcessorError" as const,
        message: `Failed to process user ${user.uid}: ${error instanceof Error ? error.message : String(error)}`,
      }),
    });
  }

  createScheduledUserProcessor(
    options: Partial<UserProcessingOptions> = {},
  ): Effect.Effect<void, UserProcessorError> {
    return Effect.gen(function* () {
      const userStream = new UserProcessorService().processUsersWithBoundedConcurrency(options);

      yield* Stream.runForEach(userStream, (user) =>
        new UserProcessorService().processUserForMutations(user),
      );
    });
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
