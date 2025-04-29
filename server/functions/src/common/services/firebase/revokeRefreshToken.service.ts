import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { flagRefreshToken } from "./firestore.service.js";

if (getApps().length === 0) {
  initializeApp();
}
/**
 * Revoke the refresh token for a user
 *
 * @export
 * @param {string} uid - The user id
 */
export async function revokeRefreshToken(uid: string) {
  try {
    await getAuth().revokeRefreshTokens(uid);
    logger.log(`Token revoked for user ${uid} successfully.`);

    // TODO: change the refresh token in the database to null, or other sentinel value
    await flagRefreshToken(uid);
    // TODO: check this sentinel value before we try to perform and actions for that user (might just need to return empty from the fetch teams?)
    // TODO: Log the sentinel thing in the db as a warn or info?
  } catch (error) {
    logger.log(error);
  }
}
