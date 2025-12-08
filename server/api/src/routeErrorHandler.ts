import { getErrorMessage, isAuthorizationError } from "@common/utilities/error";
import { structuredLogger } from "@core/common/services/structured-logger.js";
import { HTTPException } from "hono/http-exception";

export const YAHOO_AUTH_REQUIRED_CODE = "YAHOO_AUTH_REQUIRED";

interface RouteErrorContext {
  readonly userId?: string;
  readonly route?: string;
  readonly method?: string;
}

/**
 * Handles route errors by logging and throwing HTTPException.
 * Throws 401 with code "YAHOO_AUTH_REQUIRED" for Yahoo auth errors,
 * otherwise throws 500 with generic error message.
 *
 * @throws {HTTPException} Always throws - callers should use this in catch blocks
 */
export function handleRouteError(error: unknown, context?: RouteErrorContext): never {
  if (isAuthorizationError(error)) {
    structuredLogger.warn("Yahoo authorization failed", {
      phase: "execution",
      service: "yahoo",
      event: "YAHOO_AUTH_ERROR",
      userId: context?.userId,
      route: context?.route,
      method: context?.method,
      outcome: "handled-error",
      terminated: true,
    });

    throw new HTTPException(401, {
      message: JSON.stringify({
        error: "Yahoo authorization failed",
        message: "Please sign in with Yahoo again.",
        code: YAHOO_AUTH_REQUIRED_CODE,
      }),
    });
  }

  const errorMessage = getErrorMessage(error);

  structuredLogger.error(
    "Route handler failed",
    {
      phase: "execution",
      event: "ROUTE_ERROR",
      userId: context?.userId,
      route: context?.route,
      method: context?.method,
      outcome: "unhandled-error",
      terminated: true,
    },
    error,
  );

  throw new HTTPException(500, {
    message: JSON.stringify({
      error: errorMessage,
    }),
  });
}
