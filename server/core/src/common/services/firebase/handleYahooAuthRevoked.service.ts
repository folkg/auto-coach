import { sendUserEmail } from "../email/email.service.js";
import { structuredLogger } from "../structured-logger.js";
import { revokeRefreshToken } from "./revokeRefreshToken.service.js";

/**
 * Handles Yahoo auth revocation: revokes Firebase tokens + flags Firestore + sends user email.
 * Call this when Yahoo API returns 401/403 or when refresh token is invalid.
 *
 * @param uid - The user ID
 */
export async function handleYahooAuthRevoked(uid: string): Promise<void> {
  structuredLogger.info("Handling Yahoo auth revocation", {
    phase: "firebase",
    event: "AUTH_REVOCATION_START",
    operation: "handleYahooAuthRevoked",
    userId: uid,
  });

  await revokeRefreshToken(uid);

  const emailSent = await sendUserEmail(
    uid,
    "Urgent Action Required: Yahoo Authentication Error",
    [
      "<strong>Your Yahoo access has expired and your lineups are no longer being managed by Fantasy AutoCoach.</strong>",
      "Please visit the Fantasy AutoCoach website below and sign in again with Yahoo so that we can continue to " +
        "manage your teams. Once you sign in, you will be re-directed to your dashabord and we " +
        "will have everything we need to continue managing your teams. Thank you for your assistance, and we " +
        "apologize for the inconvenience.",
    ],
    "Sign In",
    "https://fantasyautocoach.com/",
  );

  if (emailSent) {
    structuredLogger.info("Yahoo auth revocation handled successfully", {
      phase: "firebase",
      event: "AUTH_REVOCATION_COMPLETE",
      operation: "handleYahooAuthRevoked",
      userId: uid,
      emailSent: true,
      outcome: "success",
    });
  } else {
    structuredLogger.warn("Yahoo auth revocation completed but email failed", {
      phase: "firebase",
      event: "AUTH_REVOCATION_PARTIAL",
      operation: "handleYahooAuthRevoked",
      userId: uid,
      emailSent: false,
      outcome: "handled-error",
      terminated: false,
    });
  }
}
