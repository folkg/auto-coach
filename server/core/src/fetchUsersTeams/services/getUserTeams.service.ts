import type { ClientTeam, FirestoreTeam } from "@common/types/team.js";
import { isDefined } from "@common/utilities/checks.js";
import {
  fetchTeamsFirestore,
  syncTeamsInFirestore,
} from "../../common/services/firebase/firestore.service.js";
import { fetchTeamsYahoo } from "./fetchUsersTeams.service.js";

/**
 * Get user's teams by combining data from Yahoo API and Firestore
 *
 * @param uid - The user ID
 * @returns An array of ClientTeam objects
 */
export async function getUserTeams(uid: string): Promise<ClientTeam[]> {
  const [yahooTeams, firestoreTeams] = await Promise.all([
    fetchTeamsYahoo(uid),
    fetchTeamsFirestore(uid),
  ]);

  if (yahooTeams.length === 0) {
    throw new Error("No teams were returned from Yahoo. Please try again later.");
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
    console.error("Error syncing teams in firebase: ", error);
  }

  return existingPatchedTeams.concat(newPatchedTeams);
}

// TODO: Consolidate the Teams types better. Store everything as a "Team" in Firebae so we don't need all of these different bespoke Team shapes.
// The when we call this, it will just get the cached team and we don't have to merge them on the Client.
export function getUserTeamsPartial(uid: string): Promise<FirestoreTeam[]> {
  return fetchTeamsFirestore(uid);
}
