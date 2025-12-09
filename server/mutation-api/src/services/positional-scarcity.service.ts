import type { CommonTeam } from "@common/types/team.js";

import { Effect, Schema } from "effect";

import type { LeagueSpecificScarcityOffsets } from "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js";

import {
  getScarcityOffsetsForTeam as coreGetScarcityOffsetsForTeam,
  recalculateScarcityOffsetsForAll as coreRecalculateScarcityOffsetsForAll,
} from "../../../core/src/calcPositionalScarcity/services/positionalScarcity.service.js";

export class PositionalScarcityError extends Schema.TaggedError<PositionalScarcityError>()(
  "PositionalScarcityError",
  {
    message: Schema.String,
    error: Schema.optional(Schema.Defect),
  },
) {}

export function getScarcityOffsetsForTeam(
  team: CommonTeam,
): Effect.Effect<LeagueSpecificScarcityOffsets, PositionalScarcityError> {
  return Effect.tryPromise({
    try: () => coreGetScarcityOffsetsForTeam(team),
    catch: (error) =>
      PositionalScarcityError.make({
        message: "Failed to get scarcity offsets for team",
        error,
      }),
  });
}

export function recalculateScarcityOffsetsForAll(): Effect.Effect<void, PositionalScarcityError> {
  return Effect.tryPromise({
    try: () => coreRecalculateScarcityOffsetsForAll(),
    catch: (error) =>
      PositionalScarcityError.make({
        message: "Failed to recalculate scarcity offsets for all",
        error,
      }),
  });
}
