/**
 * Common logging context helpers for the mutation-api.
 *
 * Effect annotations propagate down through the effect tree, so annotations
 * set at the route level will appear on all logs within that effect.
 * Use the object form: Effect.annotateLogs({ key1: "value1", key2: "value2" })
 */
import { Effect } from "effect";

/**
 * Annotates an effect with full execution context for mutation tasks.
 * All logs within this effect will include these annotations.
 */
export function withExecutionContext<A, E, R>(
  ctx: {
    readonly requestId: string;
    readonly taskId: string;
    readonly userId: string;
    readonly operation: string;
  },
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.annotateLogs(effect, {
    requestId: ctx.requestId,
    taskId: ctx.taskId,
    userId: ctx.userId,
    operation: ctx.operation,
    phase: "execution",
  });
}

/**
 * Annotates an effect with dispatch context.
 * All logs within this effect will include these annotations.
 */
export function withDispatchContext<A, E, R>(
  ctx: {
    readonly requestId: string;
    readonly operation: string;
  },
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.annotateLogs(effect, {
    requestId: ctx.requestId,
    operation: ctx.operation,
    phase: "dispatch",
  });
}
