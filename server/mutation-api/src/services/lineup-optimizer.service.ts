import type { TeamOptimizer } from "@common/types/team.js";
import type {
  LineupChanges,
  PlayerTransaction,
} from "@common/types/transactions.js";
import { Data, Effect } from "effect";
import type { LeagueSpecificScarcityOffsets } from "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js";
import { LineupOptimizer as CoreLineupOptimizer } from "../../../core/src/dispatchSetLineup/classes/LineupOptimizer.js";

export class LineupOptimizerError extends Data.TaggedError(
  "LineupOptimizerError",
)<{
  readonly message: string;
}> {}

export class LineupOptimizer {
  constructor(private readonly coreOptimizer: CoreLineupOptimizer) {}

  optimizeStartingLineup(): Effect.Effect<void, LineupOptimizerError> {
    return Effect.try({
      try: () => {
        this.coreOptimizer.optimizeStartingLineup();
      },
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to optimize starting lineup: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  generateDropPlayerTransactions(): Effect.Effect<void, LineupOptimizerError> {
    return Effect.try({
      try: () => {
        this.coreOptimizer.generateDropPlayerTransactions();
      },
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to generate drop transactions: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  generateAddPlayerTransactions(): Effect.Effect<void, LineupOptimizerError> {
    return Effect.try({
      try: () => {
        this.coreOptimizer.generateAddPlayerTransactions();
      },
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to generate add transactions: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  generateSwapPlayerTransactions(): Effect.Effect<void, LineupOptimizerError> {
    return Effect.try({
      try: () => {
        this.coreOptimizer.generateSwapPlayerTransactions();
      },
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to generate swap transactions: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  get lineupChanges(): Effect.Effect<
    LineupChanges | null,
    LineupOptimizerError
  > {
    return Effect.try({
      try: () => this.coreOptimizer.lineupChanges,
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to get lineup changes: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  get playerTransactions(): Effect.Effect<
    PlayerTransaction[] | null,
    LineupOptimizerError
  > {
    return Effect.try({
      try: () => this.coreOptimizer.playerTransactions,
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to get player transactions: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  shouldPostLineupChanges(): Effect.Effect<boolean, LineupOptimizerError> {
    return Effect.try({
      try: () => this.coreOptimizer.shouldPostLineupChanges(),
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to determine if lineup changes should be posted: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  setAddCandidates(
    candidates: import("@common/types/Player.js").IPlayer[],
  ): Effect.Effect<void, LineupOptimizerError> {
    return Effect.try({
      try: () => {
        this.coreOptimizer.addCandidates = candidates;
      },
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to set add candidates: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  getCurrentTeamState(): Effect.Effect<TeamOptimizer, LineupOptimizerError> {
    return Effect.try({
      try: () => this.coreOptimizer.getCurrentTeamState(),
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to get current team state: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  isSuccessfullyOptimized(): Effect.Effect<boolean, LineupOptimizerError> {
    return Effect.try({
      try: () => this.coreOptimizer.isSuccessfullyOptimized(),
      catch: (error) =>
        new LineupOptimizerError({
          message: `Failed to check if lineup is successfully optimized: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }
}

export function createLineupOptimizer(
  team: TeamOptimizer,
  positionalScarcityOffsets?: LeagueSpecificScarcityOffsets,
): Effect.Effect<LineupOptimizer, LineupOptimizerError> {
  return Effect.try({
    try: () => {
      const coreOptimizer = new CoreLineupOptimizer(
        team,
        positionalScarcityOffsets,
      );
      return new LineupOptimizer(coreOptimizer);
    },
    catch: (error) =>
      new LineupOptimizerError({
        message: `Failed to create lineup optimizer: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });
}
