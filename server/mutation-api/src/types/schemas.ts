import { Data, Schema } from "effect";

export const MutationTaskType = Schema.Literal(
  "SET_LINEUP",
  "WEEKLY_TRANSACTIONS",
  "CALC_POSITIONAL_SCARCITY",
);

// Team schema for payload validation (matches FirestoreTeam structure)
export const FirestoreTeamPayloadSchema = Schema.Struct({
  team_key: Schema.String,
  game_code: Schema.String,
  start_date: Schema.Number,
  end_date: Schema.Number,
  weekly_deadline: Schema.String,
  roster_positions: Schema.Record({ key: Schema.String, value: Schema.Number }),
  num_teams: Schema.Number,
  allow_transactions: Schema.Boolean,
  allow_dropping: Schema.Boolean,
  allow_adding: Schema.Boolean,
  allow_add_drops: Schema.Boolean,
  allow_waiver_adds: Schema.Boolean,
  automated_transaction_processing: Schema.optional(Schema.Boolean),
  last_updated: Schema.Number,
  lineup_paused_at: Schema.optional(Schema.Number),
  uid: Schema.String,
  is_subscribed: Schema.Boolean,
  is_setting_lineups: Schema.Boolean,
});

// Payload schemas for task types
export const SetLineupPayloadSchema = Schema.Struct({
  uid: Schema.String,
  teams: Schema.Array(FirestoreTeamPayloadSchema),
});

export const WeeklyTransactionsPayloadSchema = Schema.Struct({
  uid: Schema.String,
  teams: Schema.Array(FirestoreTeamPayloadSchema),
});

export const CalcPositionalScarcityPayloadSchema = Schema.Struct({});

// Discriminated union for all payload types
export const MutationPayloadSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("SET_LINEUP"),
    payload: SetLineupPayloadSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("WEEKLY_TRANSACTIONS"),
    payload: WeeklyTransactionsPayloadSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("CALC_POSITIONAL_SCARCITY"),
    payload: CalcPositionalScarcityPayloadSchema,
  }),
);

export type MutationPayload = Schema.Schema.Type<typeof MutationPayloadSchema>;

export const MutationTaskStatus = Schema.Literal(
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
);

export const MutationTaskSchema = Schema.Struct({
  id: Schema.String,
  type: MutationTaskType,
  payload: Schema.Unknown,
  userId: Schema.String,
  createdAt: Schema.String,
  status: MutationTaskStatus,
});

export type MutationTask = Schema.Schema.Type<typeof MutationTaskSchema>;

export const RateLimitStateSchema = Schema.Struct({
  userId: Schema.String,
  count: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
  windowStart: Schema.String,
  windowSizeMs: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
});

export type RateLimitState = Schema.Schema.Type<typeof RateLimitStateSchema>;

export class HttpError extends Data.TaggedError("HttpError")<{
  readonly message: string;
  readonly statusCode: number;
}> {}
