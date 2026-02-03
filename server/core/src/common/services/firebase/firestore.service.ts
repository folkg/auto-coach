import {
  type ClientTeam,
  FirestoreTeam,
  type InfoTeam,
  yahooToFirestore,
} from "@common/types/team.js";
import { assertType } from "@common/utilities/checks.js";
import { getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
  getFirestore,
  type QuerySnapshot,
} from "firebase-admin/firestore";

import type { ScarcityOffsetsCollection } from "../../../calcPositionalScarcity/services/positionalScarcity.service.js";
import type { ReturnCredential, Token } from "../../interfaces/credential.js";

import { structuredLogger } from "../structured-logger.js";
import {
  getCurrentPacificNumDay,
  getPacificTimeDateString,
  todayPacific,
} from "../utilities.service.js";
import { refreshYahooAccessToken } from "../yahooAPI/yahooAPI.service.js";
import { isHttpError } from "../yahooAPI/yahooHttp.service.js";
import { fetchStartingPlayers } from "../yahooAPI/yahooStartingPlayer.service.js";
import { RevokedRefreshTokenError } from "./errors.js";
import { handleYahooAuthRevoked } from "./handleYahooAuthRevoked.service.js";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

const firebaseApp =
  getApps().length === 0
    ? initializeApp({
        projectId: FIREBASE_PROJECT_ID,
      })
    : getApps()[0];

if (!firebaseApp) {
  throw new Error("Failed to initialize Firebase app");
}

export const db = getFirestore(firebaseApp);
db.settings({
  ignoreUndefinedProperties: true,
  preferRest: true,
});

/**
 * Load the access token from DB, or refresh from Yahoo if expired
 * @param uid The firebase uid
 * @return The credential with token and expiry
 */
export async function loadYahooAccessToken(uid: string): Promise<ReturnCredential> {
  // fetch the current token from the database
  const doc = await db.collection("users").doc(uid).get();
  const docData = doc.data();
  if (!(doc.exists && docData)) {
    throw new Error(`No access token found for user ${uid}`);
  }
  if (docData.refreshToken === "-1") {
    // Self-healing: ensure teams are disabled for users with revoked tokens
    // This handles users who had tokens revoked before we added the team disabling logic
    await disableLineupSettingForUser(uid);
    throw new RevokedRefreshTokenError(
      `User ${uid} has revoked access. Stopping all actions for this user.`,
    );
  }

  // return the current token if it is valid, or refresh the token if not
  let credential: ReturnCredential;
  // add 10 seconds to the expiration time to account for latency
  if (docData.tokenExpirationTime < Date.now() + 10000) {
    let token: Token;
    try {
      token = await refreshYahooAccessToken(docData.refreshToken);
    } catch (error: unknown) {
      structuredLogger.error(
        "Could not refresh access token",
        {
          phase: "firebase",
          service: "yahoo",
          event: "TOKEN_REFRESH_FAILED",
          operation: "loadYahooAccessToken",
          userId: uid,
          outcome: "unhandled-error",
        },
        error,
      );
      if (isHttpError(error)) {
        const responseData = error.response?.data;
        const parsedData =
          typeof responseData === "string" ? JSON.parse(responseData) : responseData;
        if (
          parsedData?.error === "invalid_grant" &&
          parsedData?.error_description === "Invalid refresh token"
        ) {
          // Record auth failure - only revoke after sufficient failures to handle transient errors
          await recordAuthFailureAndMaybeRevoke(uid);
        }
        throw new Error(
          `Could not refresh access token for user: ${uid} : ${parsedData?.error} ${parsedData?.error_description}`,
        );
      }
      throw new Error(`Could not refresh access token for user: ${uid} : ${error}`);
    }
    try {
      await db
        .collection("users")
        .doc(uid)
        .update({ ...token });
      // Reset auth failure count on successful token refresh
      await resetAuthFailureCount(uid);
    } catch (error) {
      structuredLogger.error(
        "Error storing token in Firestore",
        {
          phase: "firebase",
          service: "firebase",
          event: "TOKEN_STORE_FAILED",
          operation: "loadYahooAccessToken",
          userId: uid,
          outcome: "handled-error",
          terminated: false,
        },
        error,
      );
    }

    credential = {
      accessToken: token.accessToken,
      tokenExpirationTime: token.tokenExpirationTime,
    };
  } else {
    credential = {
      accessToken: docData.accessToken,
      tokenExpirationTime: docData.tokenExpirationTime,
    };
  }
  return credential;
}

/**
 * Set the refresh token to sentinel value in the database for the specified user
 *
 * @export
 * @async
 * @param uid - The user id
 */
export async function flagRefreshToken(uid: string): Promise<void> {
  try {
    await db.collection("users").doc(uid).update({ refreshToken: "-1" });
  } catch (error) {
    structuredLogger.error(
      "Error setting refresh token to sentinel value",
      {
        phase: "firebase",
        service: "firebase",
        event: "FLAG_REFRESH_TOKEN_FAILED",
        operation: "flagRefreshToken",
        userId: uid,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}

/** Number of auth failures required before revoking a user's refresh token */
const AUTH_FAILURE_THRESHOLD = 3;

/**
 * Records an auth failure for a user and revokes their token if threshold is reached.
 * This prevents revoking tokens on transient errors - we require sufficient failures before revoking.
 *
 * @returns true if the token was revoked, false if just recorded a failure
 */
export async function recordAuthFailureAndMaybeRevoke(uid: string): Promise<boolean> {
  try {
    const userRef = db.collection("users").doc(uid);

    // Atomically increment the failure count
    await userRef.update({
      authFailureCount: FieldValue.increment(1),
      lastAuthFailureAt: Date.now(),
    });

    // Read the updated count
    const userDoc = await userRef.get();
    const failureCount = userDoc.data()?.authFailureCount ?? 1;

    structuredLogger.info("Recorded auth failure", {
      phase: "firebase",
      service: "firebase",
      event: "AUTH_FAILURE_RECORDED",
      operation: "recordAuthFailureAndMaybeRevoke",
      userId: uid,
      failureCount,
      threshold: AUTH_FAILURE_THRESHOLD,
      outcome: "success",
    });

    if (failureCount >= AUTH_FAILURE_THRESHOLD) {
      structuredLogger.warn("Auth failure threshold reached, revoking token", {
        phase: "firebase",
        service: "firebase",
        event: "AUTH_FAILURE_THRESHOLD_REACHED",
        operation: "recordAuthFailureAndMaybeRevoke",
        userId: uid,
        failureCount,
        outcome: "success",
      });
      await handleYahooAuthRevoked(uid);
      return true;
    }

    return false;
  } catch (error) {
    structuredLogger.error(
      "Error recording auth failure",
      {
        phase: "firebase",
        service: "firebase",
        event: "RECORD_AUTH_FAILURE_FAILED",
        operation: "recordAuthFailureAndMaybeRevoke",
        userId: uid,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
    return false;
  }
}

/**
 * Resets the auth failure count for a user after successful token refresh.
 */
export async function resetAuthFailureCount(uid: string): Promise<void> {
  try {
    await db.collection("users").doc(uid).update({
      authFailureCount: 0,
    });
  } catch (_error) {
    // Don't fail if we can't reset - it's not critical
    structuredLogger.warn("Could not reset auth failure count", {
      phase: "firebase",
      service: "firebase",
      event: "RESET_AUTH_FAILURE_FAILED",
      operation: "resetAuthFailureCount",
      userId: uid,
      outcome: "handled-error",
      terminated: false,
    });
  }
}

/**
 * Fetches all teams from Firestore for the user
 *
 * @export
 * @param uid - The user id
 * @return - An array of teams
 */
export async function fetchTeamsFirestore(uid: string): Promise<FirestoreTeam[]> {
  try {
    // get all teams for the user that have not ended
    const teamsRef = db.collection(`users/${uid}/teams`);
    const teamsSnapshot = await teamsRef.where("end_date", ">=", Date.now()).get();

    return teamsSnapshot.docs.map((doc) => {
      const team = doc.data();
      assertType(team, FirestoreTeam);
      return team;
    });
  } catch (error) {
    structuredLogger.error(
      "Error fetching teams from Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "FETCH_TEAMS_FAILED",
        operation: "fetchTeamsFirestore",
        userId: uid,
        outcome: "unhandled-error",
        terminated: true,
      },
      error,
    );
    throw new Error(`Error fetching teams from Firebase. User: ${uid}`);
  }
}

/**
 * Disables lineup setting for all of a user's teams.
 * Called when Yahoo auth is revoked to prevent teams from being scheduled.
 *
 * @export
 * @async
 * @param uid - The user id
 */
export async function disableLineupSettingForUser(uid: string): Promise<void> {
  try {
    const teamsRef = db.collection(`users/${uid}/teams`);
    const teamsSnapshot = await teamsRef.where("is_setting_lineups", "==", true).get();

    if (teamsSnapshot.empty) {
      structuredLogger.info("No teams with lineup setting enabled", {
        phase: "firebase",
        service: "firebase",
        event: "NO_TEAMS_TO_DISABLE",
        operation: "disableLineupSettingForUser",
        userId: uid,
        outcome: "success",
      });
      return;
    }

    const batch = db.batch();
    for (const doc of teamsSnapshot.docs) {
      batch.update(doc.ref, { is_setting_lineups: false });
    }
    await batch.commit();

    structuredLogger.info("Disabled lineup setting for all user teams", {
      phase: "firebase",
      service: "firebase",
      event: "LINEUP_SETTING_DISABLED",
      operation: "disableLineupSettingForUser",
      userId: uid,
      teamsDisabled: teamsSnapshot.size,
      outcome: "success",
    });
  } catch (error) {
    structuredLogger.error(
      "Error disabling lineup setting for user teams",
      {
        phase: "firebase",
        service: "firebase",
        event: "DISABLE_LINEUP_SETTING_FAILED",
        operation: "disableLineupSettingForUser",
        userId: uid,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}

/**
 * Fetches all teams from Firestore for the user that are actively setting
 * lineups
 *
 * @export
 * @async
 * @param leagues - The leagues to filter by
 * @return - An array of teams from Firestore
 */
export async function getActiveTeamsForLeagues(
  leagues: string[],
): Promise<QuerySnapshot<DocumentData>> {
  let result: QuerySnapshot<DocumentData>;
  try {
    const teamsRef = db.collectionGroup("teams");
    result = await teamsRef
      .where("is_setting_lineups", "==", true)
      .where("end_date", ">=", Date.now())
      .where("game_code", "in", leagues)
      .where("weekly_deadline", "in", ["", "intraday", getCurrentPacificNumDay().toString()]) // TODO: Since we have this in here, do we need it in the JS check later? OR should we remove it from here?
      .get();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  return result;
}

export async function getActiveTeamsForUser(uid: string): Promise<QuerySnapshot<DocumentData>> {
  let result: QuerySnapshot<DocumentData>;
  try {
    const teamsRef = db.collection(`users/${uid}/teams`);
    result = await teamsRef
      .where("is_setting_lineups", "==", true)
      .where("allow_transactions", "==", true)
      .where("end_date", ">=", Date.now())
      .get();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  return result;
}

/**
 * Fetches all teams from Firestore for the user that are actively setting
 * lineups, allow transactions, and have a weekly deadline
 *
 * @export
 * @async
 * @return - An array of teams from Firestore
 */
export async function getTomorrowsActiveWeeklyTeams(): Promise<QuerySnapshot<DocumentData>> {
  let result: QuerySnapshot<DocumentData>;

  try {
    const teamsRef = db.collectionGroup("teams");
    result = await teamsRef
      .where("is_setting_lineups", "==", true)
      .where("allow_transactions", "==", true)
      .where("end_date", ">=", Date.now())
      .where("weekly_deadline", "==", (getCurrentPacificNumDay() + 1).toString())
      .get();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  return result;
}

/**
 * Syncs teams in Firestore with teams from Yahoo
 *
 * @export
 * @async
 * @param missingTeams - Teams that are in Yahoo but not in Firestore
 * @param extraTeams - Teams that are in Firestore but not in Yahoo
 * @param uid - The user id
 * @return - The teams that were synced
 */
export async function syncTeamsInFirestore(
  missingTeams: InfoTeam[],
  extraTeams: FirestoreTeam[],
  uid: string,
): Promise<ClientTeam[]> {
  const result: ClientTeam[] = [];

  const collectionPath = `users/${uid}/teams`;
  const batch = db.batch();

  for (const mTeam of missingTeams) {
    if (mTeam.end_date < Date.now()) {
      continue;
    }

    const firestoreTeam = yahooToFirestore(mTeam, uid);

    const docId = String(mTeam.team_key);
    const docRef = db.collection(collectionPath).doc(docId);
    batch.set(docRef, firestoreTeam);

    result.push({ ...mTeam, ...firestoreTeam });
  }

  for (const eTeam of extraTeams) {
    const docId = String(eTeam.team_key);
    const docRef = db.collection(collectionPath).doc(docId);
    batch.delete(docRef);
  }
  try {
    await batch.commit();
  } catch (error) {
    structuredLogger.error(
      "Error syncing teams in Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "SYNC_TEAMS_FAILED",
        operation: "syncTeamsInFirestore",
        userId: uid,
        missingTeamCount: missingTeams.length,
        extraTeamCount: extraTeams.length,
        outcome: "unhandled-error",
        terminated: true,
      },
      error,
    );
    throw new Error("Error syncing teams in Firebase.");
  }

  return result;
}

/**
 * Updates the Firestore timestamp for a team after a successful lineup set.
 * Also resets failure count since the lineup was set successfully.
 *
 * @async
 * @param uid The firebase uid
 * @param teamKey The team key
 */
export async function updateFirestoreTimestamp(uid: string, teamKey: string): Promise<void> {
  const teamRef = db.collection(`users/${uid}/teams`).doc(teamKey);
  try {
    await teamRef.update({
      last_updated: Date.now(),
      lineup_failure_count: 0,
    });
  } catch (error) {
    structuredLogger.error(
      "Error updating Firestore timestamp",
      {
        phase: "firebase",
        service: "firebase",
        event: "UPDATE_TIMESTAMP_FAILED",
        operation: "updateFirestoreTimestamp",
        userId: uid,
        teamKey,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}

/**
 * Records a lineup setting failure for a team.
 * Increments the failure count and updates the last failure timestamp.
 *
 * @async
 * @param uid The firebase uid
 * @param teamKey The team key
 */
export async function recordTeamLineupFailure(uid: string, teamKey: string): Promise<void> {
  const teamRef = db.collection(`users/${uid}/teams`).doc(teamKey);
  const now = Date.now();
  try {
    // Use FieldValue.increment to atomically increment the failure count
    await teamRef.update({
      lineup_failure_count: FieldValue.increment(1),
      last_lineup_failure_at: now,
    });
    structuredLogger.info("Recorded lineup failure for team", {
      phase: "firebase",
      service: "firebase",
      event: "LINEUP_FAILURE_RECORDED",
      operation: "recordTeamLineupFailure",
      userId: uid,
      teamKey,
      outcome: "success",
    });
  } catch (error) {
    structuredLogger.error(
      "Error recording lineup failure",
      {
        phase: "firebase",
        service: "firebase",
        event: "RECORD_FAILURE_FAILED",
        operation: "recordTeamLineupFailure",
        userId: uid,
        teamKey,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}

export async function updateTeamFirestore(
  uid: string,
  teamKey: string,
  data: Partial<FirestoreTeam>,
): Promise<void> {
  const teamRef = db.collection(`users/${uid}/teams`).doc(teamKey);
  try {
    await teamRef.update(data);
    structuredLogger.info("Updated team in Firestore", {
      phase: "firebase",
      service: "firebase",
      event: "TEAM_UPDATED",
      operation: "updateTeamFirestore",
      userId: uid,
      teamKey,
      outcome: "success",
    });
  } catch (error) {
    structuredLogger.error(
      "Error updating team in Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "UPDATE_TEAM_FAILED",
        operation: "updateTeamFirestore",
        userId: uid,
        teamKey,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}

/**
 * @async
 * @param league The league code
 * @return the teams
 */
export async function getIntradayTeams(league: string): Promise<QuerySnapshot<DocumentData>> {
  const teamsRef = db.collectionGroup("teams");
  try {
    const teamsSnapshot = await teamsRef
      .where("game_code", "==", league)
      .where("end_date", ">=", Date.now())
      .where("weekly_deadline", "==", "intraday")
      .get();
    return teamsSnapshot;
  } catch (error) {
    structuredLogger.error(
      "Error fetching intraday teams from Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "FETCH_INTRADAY_TEAMS_FAILED",
        operation: "getIntradayTeams",
        league,
        outcome: "unhandled-error",
        terminated: true,
      },
      error,
    );
    throw new Error(`Error fetching Intraday ${league.toUpperCase()} teams from firestore`);
  }
}

/**
 * Stores today's starting players in Firestore.
 * This would be used for goalies in the NHL and pitchers in MLB
 *
 * @export
 * @async
 * @param startingPlayers - the starting players
 * @param league - the league
 */
export async function storeStartingPlayersInFirestore(
  startingPlayers: string[],
  league: string,
): Promise<void> {
  const startingPlayersRef = db.collection("startingPlayers");
  try {
    await startingPlayersRef.doc(league).set({
      startingPlayers,
      date: getPacificTimeDateString(new Date()),
    });
  } catch (error) {
    structuredLogger.error(
      "Error storing starting players in Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "STORE_STARTING_PLAYERS_FAILED",
        operation: "storeStartingPlayersInFirestore",
        league,
        playerCount: startingPlayers.length,
        outcome: "unhandled-error",
        terminated: true,
      },
      error,
    );
    throw new Error(`Error storing starting ${league.toUpperCase()} players in Firestore`);
  }
}

/**
 * Gets today's starting players from Firestore.
 * This would be used for goalies in the NHL and pitchers in MLB
 *
 * @export
 * @async
 * @param league - the league
 * @return - the starting players
 */
export async function getStartingPlayersFromFirestore(league: string): Promise<string[]> {
  const startingPlayersRef = db.collection("startingPlayers");
  try {
    const startingPlayersSnapshot: DocumentSnapshot<DocumentData> = await startingPlayersRef
      .doc(league)
      .get();

    if (startingPlayersSnapshot.exists) {
      // check if the starting players were updated today
      const date: string = startingPlayersSnapshot.data()?.date;
      const today = getPacificTimeDateString(new Date());

      if (date === today) {
        return startingPlayersSnapshot.data()?.startingPlayers;
      }
    }
    // if the starting players were not updated today,
    // or don't exist in firebase, fetch them from Yahoo API
    structuredLogger.info("Starting players not found in Firestore, fetching from Yahoo", {
      phase: "firebase",
      service: "firebase",
      event: "STARTING_PLAYERS_CACHE_MISS",
      operation: "getStartingPlayersFromFirestore",
      league,
    });
    try {
      await fetchStartingPlayers(league);
      return getStartingPlayersFromFirestore(league);
    } catch (error) {
      structuredLogger.error(
        "Error fetching starting players from Yahoo",
        {
          phase: "firebase",
          service: "yahoo",
          event: "FETCH_STARTING_PLAYERS_FALLBACK_FAILED",
          operation: "getStartingPlayersFromFirestore",
          league,
          outcome: "handled-error",
          terminated: false,
        },
        error,
      );
    }
  } catch (error) {
    structuredLogger.error(
      "Error getting starting players from Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "GET_STARTING_PLAYERS_FAILED",
        operation: "getStartingPlayersFromFirestore",
        league,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }

  // return an empty array if there was an error
  // we can still proceed with the rest of the program
  return [];
}

export async function getPositionalScarcityOffsets(): Promise<ScarcityOffsetsCollection> {
  const scarcityOffsetsRef = db.collection("positionalScarcityOffsets");
  try {
    const scarcityOffsetsSnapshot: QuerySnapshot<DocumentData> = await scarcityOffsetsRef.get();

    if (scarcityOffsetsSnapshot.empty) {
      return {};
    }

    const offsets: ScarcityOffsetsCollection = {};
    for (const doc of scarcityOffsetsSnapshot.docs) {
      offsets[doc.id] = doc.data();
    }
    return offsets;
  } catch (error) {
    structuredLogger.error(
      "Error getting scarcity offsets from Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "GET_SCARCITY_OFFSETS_FAILED",
        operation: "getPositionalScarcityOffsets",
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
    return {};
  }
}

export async function updatePositionalScarcityOffset(
  league: string,
  position: string,
  offsets: number[],
): Promise<void> {
  const scarcityOffsetsRef = db.collection("positionalScarcityOffsets");
  try {
    await scarcityOffsetsRef.doc(league).set(
      {
        [position]: offsets,
      },
      { merge: true },
    );
    structuredLogger.info("Updated positional scarcity offsets in Firestore", {
      phase: "firebase",
      service: "firebase",
      event: "SCARCITY_OFFSETS_UPDATED",
      operation: "updatePositionalScarcityOffset",
      league,
      position,
      outcome: "success",
    });
  } catch (error) {
    structuredLogger.error(
      "Error storing positional scarcity offsets in Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "UPDATE_SCARCITY_OFFSETS_FAILED",
        operation: "updatePositionalScarcityOffset",
        league,
        position,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}

export async function storeTodaysPostponedTeams(teams: string[]): Promise<void> {
  try {
    await db.collection("postponedGames").doc("today").set({
      date: todayPacific(),
      teams,
    });
  } catch (error) {
    structuredLogger.error(
      "Error storing postponed games in Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "STORE_POSTPONED_GAMES_FAILED",
        operation: "storeTodaysPostponedTeams",
        teamCount: teams.length,
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }
}

export async function getTodaysPostponedTeams(): Promise<Set<string> | undefined> {
  try {
    const postponedGamesSnapshot = await db.collection("postponedGames").doc("today").get();

    if (postponedGamesSnapshot.exists) {
      // check if the postponed games were updated today
      const date: string | undefined = postponedGamesSnapshot.data()?.date;

      if (date === todayPacific()) {
        const teams: string[] | undefined = postponedGamesSnapshot.data()?.teams;
        return new Set(teams);
      }
    }
  } catch (error) {
    structuredLogger.error(
      "Error getting postponed games from Firestore",
      {
        phase: "firebase",
        service: "firebase",
        event: "GET_POSTPONED_GAMES_FAILED",
        operation: "getTodaysPostponedTeams",
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
  }

  return undefined;
}

export async function getRandomUID(): Promise<string> {
  const usersRef = db.collection("users");
  // Allow any errors to bubble up to the caller
  // Orders by the ever-changing access token, then gets the first one
  const randomUserSnapshot = await usersRef.orderBy("tokenExpirationTime", "desc").limit(1).get();
  const randomUser = randomUserSnapshot.docs[0];
  if (!randomUser) {
    throw new Error("No users found in Firestore");
  }
  return randomUser.id;
}
