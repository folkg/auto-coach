import { getAuth } from "firebase-admin/auth";

import { structuredLogger } from "../structured-logger.js";
import { flagRefreshToken } from "./firestore.service.js";

/**
 * Revoke the refresh token for a user
 *
 * @export
 * @param uid - The user id
 */
export async function revokeRefreshToken(uid: string): Promise<void> {
  try {
    await getAuth().revokeRefreshTokens(uid);
    structuredLogger.info("Token revoked successfully", {
      phase: "firebase",
      service: "firebase",
      event: "TOKEN_REVOKED",
      operation: "revokeRefreshToken",
      userId: uid,
      outcome: "success",
    });

    await flagRefreshToken(uid);
    structuredLogger.info("Refresh token flagged in Firestore", {
      phase: "firebase",
      service: "firebase",
      event: "REFRESH_TOKEN_FLAGGED",
      operation: "revokeRefreshToken",
      userId: uid,
      outcome: "success",
    });
  } catch (error) {
    structuredLogger.error(
      "Failed to revoke refresh token",
      {
        phase: "firebase",
        service: "firebase",
        event: "TOKEN_REVOCATION_FAILED",
        operation: "revokeRefreshToken",
        userId: uid,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}
