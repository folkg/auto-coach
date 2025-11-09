import { Data, Schema } from "effect";
import { MutationTaskSchema } from "./schemas";

// Request schemas
export const SetLineupRequestSchema = Schema.Struct({
  userId: Schema.String,
  teamKey: Schema.String,
  lineupChanges: Schema.Array(Schema.Unknown), // Will be typed more specifically
});

export type SetLineupRequest = Schema.Schema.Type<
  typeof SetLineupRequestSchema
>;

export const WeeklyTransactionsRequestSchema = Schema.Struct({
  userId: Schema.String,
  teamKey: Schema.String,
  transactions: Schema.Array(Schema.Unknown), // Will be typed more specifically
});

export type WeeklyTransactionsRequest = Schema.Schema.Type<
  typeof WeeklyTransactionsRequestSchema
>;

export const CalcPositionalScarcityRequestSchema = Schema.Struct({
  userId: Schema.String,
  leagueKey: Schema.String,
});

export type CalcPositionalScarcityRequest = Schema.Schema.Type<
  typeof CalcPositionalScarcityRequestSchema
>;

export const ExecuteMutationRequestSchema = Schema.Struct({
  task: MutationTaskSchema,
});

export type ExecuteMutationRequest = Schema.Schema.Type<
  typeof ExecuteMutationRequestSchema
>;

// Response schemas
export const DispatchResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  taskCount: Schema.Number,
  message: Schema.String,
});

export type DispatchResponse = Schema.Schema.Type<
  typeof DispatchResponseSchema
>;

export const ExecuteMutationResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  taskId: Schema.String,
  status: Schema.String,
  message: Schema.String,
  processedAt: Schema.String,
});

export type ExecuteMutationResponse = Schema.Schema.Type<
  typeof ExecuteMutationResponseSchema
>;

// Error response schema
export const ErrorResponseSchema = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
  code: Schema.String,
  retryAfter: Schema.optional(Schema.Number),
});

export type ErrorResponse = Schema.Schema.Type<typeof ErrorResponseSchema>;

// Error classification
export class DomainError extends Data.TaggedError("DomainError")<{
  readonly message: string;
  readonly code: string;
  readonly userId?: string;
}> {}

export class SystemError extends Data.TaggedError("SystemError")<{
  readonly message: string;
  readonly code: string;
  readonly retryable: boolean;
}> {}

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly message: string;
  readonly code: string;
  readonly retryAfter?: number;
}> {}

export type MutationError = DomainError | SystemError | RateLimitError;

// Task status updates
export const TaskStatusUpdateSchema = Schema.Struct({
  taskId: Schema.String,
  status: Schema.Union(
    Schema.Literal("PROCESSING"),
    Schema.Literal("COMPLETED"),
    Schema.Literal("FAILED"),
  ),
  message: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});

export type TaskStatusUpdate = Schema.Schema.Type<
  typeof TaskStatusUpdateSchema
>;
