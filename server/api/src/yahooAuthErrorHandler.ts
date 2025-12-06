import { getErrorMessage, isAuthorizationError } from "@common/utilities/error";
import { HTTPException } from "hono/http-exception";

export const YAHOO_AUTH_REQUIRED_CODE = "YAHOO_AUTH_REQUIRED";

/**
 * Handles route errors by throwing HTTPException.
 * Throws 401 with code "YAHOO_AUTH_REQUIRED" for Yahoo auth errors,
 * otherwise throws 500 with generic error message.
 *
 * @throws {HTTPException} Always throws - callers should use this in catch blocks
 */
export function handleRouteError(error: unknown): never {
  if (isAuthorizationError(error)) {
    throw new HTTPException(401, {
      message: JSON.stringify({
        error: "Yahoo authorization failed",
        message: "Please sign in with Yahoo again.",
        code: YAHOO_AUTH_REQUIRED_CODE,
      }),
    });
  }

  throw new HTTPException(500, {
    message: JSON.stringify({
      error: getErrorMessage(error),
    }),
  });
}
