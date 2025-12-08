import { Effect } from "effect";
import { Hono } from "hono";

import type { ErrorResponse } from "../types/api-schemas";
import type { AuthContext } from "../types/hono-app-type";

import {
  type DispatchServiceError,
  DispatchServiceImpl,
  DispatchServiceLive,
} from "../services/dispatch.service";
import { ProductionLoggerLayer } from "../services/logger.service";
import { withDispatchContext } from "../services/logging-context";
import {
  validateCalcPositionalScarcity,
  validateSetLineup,
  validateWeeklyTransactions,
} from "../validators";

function errorToResponse(error: DispatchServiceError): ErrorResponse {
  return {
    error: "Dispatch failed",
    message: error.message,
    code: error._tag,
  };
}

export function createDispatchRoutes() {
  const app = new Hono<AuthContext>();

  // Initialize services
  const dispatchService = new DispatchServiceImpl();

  // POST /set-lineup
  app.post("/set-lineup", validateSetLineup, async (c) => {
    const lineupRequest = c.req.valid("json");
    const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.set("requestId", requestId);

    const result = await Effect.runPromise(
      withDispatchContext(
        { requestId, operation: "DISPATCH_SET_LINEUP" },
        dispatchService.dispatchSetLineup(lineupRequest).pipe(
          Effect.provide(DispatchServiceLive),
          Effect.tapError((error) =>
            Effect.annotateLogs(Effect.logError("Dispatch set-lineup failed"), {
              errorTag: error._tag,
              errorMessage: error.message,
              outcome: "unhandled-error",
            }),
          ),
          Effect.tap((response) =>
            Effect.annotateLogs(Effect.logInfo("Dispatch set-lineup completed"), {
              outcome: "success",
              taskCount: response.taskCount,
            }),
          ),
          Effect.match({
            onFailure: (error) => c.json(errorToResponse(error), 500),
            onSuccess: (response) => c.json(response, 200),
          }),
        ),
      ).pipe(Effect.provide(ProductionLoggerLayer)),
    );

    return result;
  });

  // POST /weekly-transactions
  app.post("/weekly-transactions", validateWeeklyTransactions, async (c) => {
    const weeklyRequest = c.req.valid("json");
    const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.set("requestId", requestId);

    const result = await Effect.runPromise(
      withDispatchContext(
        { requestId, operation: "DISPATCH_WEEKLY_TRANSACTIONS" },
        dispatchService.dispatchWeeklyTransactions(weeklyRequest).pipe(
          Effect.provide(DispatchServiceLive),
          Effect.tapError((error) =>
            Effect.annotateLogs(Effect.logError("Dispatch weekly-transactions failed"), {
              errorTag: error._tag,
              errorMessage: error.message,
              outcome: "unhandled-error",
            }),
          ),
          Effect.tap((response) =>
            Effect.annotateLogs(Effect.logInfo("Dispatch weekly-transactions completed"), {
              outcome: "success",
              taskCount: response.taskCount,
            }),
          ),
          Effect.match({
            onFailure: (error) => c.json(errorToResponse(error), 500),
            onSuccess: (response) => c.json(response, 200),
          }),
        ),
      ).pipe(Effect.provide(ProductionLoggerLayer)),
    );

    return result;
  });

  // POST /calc-positional-scarcity
  app.post("/calc-positional-scarcity", validateCalcPositionalScarcity, async (c) => {
    const scarcityRequest = c.req.valid("json");
    const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.set("requestId", requestId);

    const result = await Effect.runPromise(
      withDispatchContext(
        { requestId, operation: "DISPATCH_CALC_POSITIONAL_SCARCITY" },
        dispatchService.dispatchCalcPositionalScarcity(scarcityRequest).pipe(
          Effect.provide(DispatchServiceLive),
          Effect.tapError((error) =>
            Effect.annotateLogs(Effect.logError("Dispatch calc-positional-scarcity failed"), {
              errorTag: error._tag,
              errorMessage: error.message,
              outcome: "unhandled-error",
            }),
          ),
          Effect.tap((response) =>
            Effect.annotateLogs(Effect.logInfo("Dispatch calc-positional-scarcity completed"), {
              outcome: "success",
              taskCount: response.taskCount,
            }),
          ),
          Effect.match({
            onFailure: (error) => c.json(errorToResponse(error), 500),
            onSuccess: (response) => c.json(response, 200),
          }),
        ),
      ).pipe(Effect.provide(ProductionLoggerLayer)),
    );

    return result;
  });

  return app;
}
