import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isDefined } from "../common/helpers/checks.js";
import type { ClientTeam } from "../common/interfaces/Team.js";
import {
  fetchTeamsFirestore,
  syncTeamsInFirestore,
} from "../common/services/firebase/firestore.service.js";
import { fetchTeamsYahoo } from "./services/fetchUsersTeams.service.js";

export const fetchuserteams = onCall(async (request): Promise<ClientTeam[]> => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to get an access token",
    );
  }

  const [yahooTeams, firestoreTeams] = await Promise.all([
    fetchTeamsYahoo(uid),
    fetchTeamsFirestore(uid),
  ]).catch((err) => {
    throw new HttpsError("data-loss", err.message);
  });

  if (yahooTeams.length === 0) {
    throw new HttpsError(
      "internal",
      "No teams were returned from Yahoo. Please try again later.",
    );
  }

  const existingPatchedTeams: ClientTeam[] = firestoreTeams
    .map((f) => {
      const yahooTeam = yahooTeams.find((y) => y.team_key === f.team_key);
      return yahooTeam ? { ...yahooTeam, ...f } : undefined;
    })
    .filter(isDefined);

  // Update the teams in firestore if required
  let newPatchedTeams: ClientTeam[] = [];
  try {
    // find all teams that are in yahoo but not in firestore
    const missingTeams = yahooTeams.filter(
      (y) => !firestoreTeams.some((f) => f.team_key === y.team_key),
    );

    // find all teams that are in firestore but not in yahoo
    const extraTeams = firestoreTeams.filter(
      (f) => !yahooTeams.some((y) => y.team_key === f.team_key),
    );

    newPatchedTeams = await syncTeamsInFirestore(missingTeams, extraTeams, uid);
  } catch (error) {
    logger.error("Error syncing teams in firebase: ", error);
  }

  return existingPatchedTeams.concat(newPatchedTeams);
});
