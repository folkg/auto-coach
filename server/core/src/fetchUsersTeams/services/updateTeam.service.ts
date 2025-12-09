import type { FirestoreTeam } from "@common/types/team.js";

import { updateTeamFirestore } from "../../common/services/firebase/firestore.service.js";

/**
 * Update the is_setting_lineups boolean for a team in Firestore
 *
 * @param uid - The user ID
 * @param teamKey - The team key
 * @param value - The new value for is_setting_lineups
 * @returns A boolean indicating success
 */
export async function updateTeamLineupSetting(
  uid: string,
  teamKey: string,
  value: boolean,
): Promise<boolean> {
  try {
    const data: Partial<FirestoreTeam> = {
      is_setting_lineups: value,
    };

    await updateTeamFirestore(uid, teamKey, data);
    return true;
  } catch (error) {
    console.error("Error updating team lineup setting:", error);
    return false;
  }
}

/**
 * Update the lineup_paused_at timestamp for a team in Firestore
 *
 * @param uid - The user ID
 * @param teamKey - The team key
 * @param value - True to pause, false to resume
 * @returns A boolean indicating success
 */
export async function updateTeamLineupPaused(
  uid: string,
  teamKey: string,
  value: boolean,
): Promise<boolean> {
  try {
    const data: Partial<FirestoreTeam> = {
      lineup_paused_at: value ? Date.now() : -1,
    };

    await updateTeamFirestore(uid, teamKey, data);
    return true;
  } catch (error) {
    console.error("Error updating team lineup paused status:", error);
    return false;
  }
}
