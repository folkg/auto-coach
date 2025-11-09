import { Effect } from "effect";
import { Hono } from "hono";
import {
  type DispatchServiceError,
  DispatchServiceImpl,
  DispatchServiceLive,
} from "../services/dispatch.service";
import type { ErrorResponse } from "../types/api-schemas";
import type { AuthContext } from "../types/hono-app-type";
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

    const result = await Effect.runPromise(
      dispatchService.dispatchSetLineup(lineupRequest).pipe(
        Effect.provide(DispatchServiceLive),
        Effect.match({
          onFailure: (error) => c.json(errorToResponse(error), 500),
          onSuccess: (response) => c.json(response, 200),
        }),
      ),
    );

    return result;
  });

  // POST /weekly-transactions
  app.post("/weekly-transactions", validateWeeklyTransactions, async (c) => {
    const weeklyRequest = c.req.valid("json");

    const result = await Effect.runPromise(
      dispatchService.dispatchWeeklyTransactions(weeklyRequest).pipe(
        Effect.provide(DispatchServiceLive),
        Effect.match({
          onFailure: (error) => c.json(errorToResponse(error), 500),
          onSuccess: (response) => c.json(response, 200),
        }),
      ),
    );

    return result;
  });

  // POST /calc-positional-scarcity
  app.post(
    "/calc-positional-scarcity",
    validateCalcPositionalScarcity,
    async (c) => {
      const scarcityRequest = c.req.valid("json");

      const result = await Effect.runPromise(
        dispatchService.dispatchCalcPositionalScarcity(scarcityRequest).pipe(
          Effect.provide(DispatchServiceLive),
          Effect.match({
            onFailure: (error) => c.json(errorToResponse(error), 500),
            onSuccess: (response) => c.json(response, 200),
          }),
        ),
      );

      return result;
    },
  );

  return app;
}
