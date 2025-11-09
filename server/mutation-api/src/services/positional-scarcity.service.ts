import type { CommonTeam } from "@common/types/team.js";
import { Data, Effect } from "effect";
import type { LeagueSpecificScarcityOffsets } from "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js";
import {
  getScarcityOffsetsForTeam as coreGetScarcityOffsetsForTeam,
  recalculateScarcityOffsetsForAll as coreRecalculateScarcityOffsetsForAll,
} from "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js";

export class PositionalScarcityError extends Data.TaggedError(
  "PositionalScarcityError",
)<{
  readonly message: string;
}> {}

export function getScarcityOffsetsForTeam(
  team: CommonTeam,
): Effect.Effect<LeagueSpecificScarcityOffsets, PositionalScarcityError> {
  return Effect.tryPromise({
    try: () => coreGetScarcityOffsetsForTeam(team),
    catch: (error) =>
      new PositionalScarcityError({
        message: `Failed to get scarcity offsets for team: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });
}

export function recalculateScarcityOffsetsForAll(): Effect.Effect<
  void,
  PositionalScarcityError
> {
  return Effect.tryPromise({
    try: () => coreRecalculateScarcityOffsetsForAll(),
    catch: (error) =>
      new PositionalScarcityError({
        message: `Failed to recalculate scarcity offsets for all: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });
}
