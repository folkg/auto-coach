import { DocumentData, QuerySnapshot } from "firebase-admin/firestore";
import { getFunctions, TaskQueue } from "firebase-admin/functions";
import { logger } from "firebase-functions";
import { getTomorrowsActiveWeeklyTeams } from "../../common/services/firebase/firestore.service";
import { getFunctionUrl } from "../../common/services/utilities.service";
import { enqueueUsersTeams, mapUsersToActiveTeams } from "./scheduling.service";

export async function scheduleWeeklyLeagueTransactions() {
  let teamsSnapshot: QuerySnapshot<DocumentData>;
  try {
    teamsSnapshot = await getTomorrowsActiveWeeklyTeams();
  } catch (error) {
    logger.error("Error fetching weekly teams from Firebase.", error);
    return;
  }

  const activeUsers: Map<string, any[]> = mapUsersToActiveTeams(teamsSnapshot);
  if (activeUsers.size === 0) {
    logger.log("No users to set lineups for");
    return;
  }

  let queue: TaskQueue<Record<string, any>>;
  let targetUri: string;
  try {
    queue = getFunctions().taskQueue("lineup-dispatchweeklyleaguetransactions");
    targetUri = await getFunctionUrl("lineup-dispatchweeklyleaguetransactions");
  } catch (error) {
    logger.error("Error getting task queue. ", error);
    return;
  }

  const enqueuedTasks = enqueueUsersTeams(activeUsers, queue, targetUri);

  try {
    await Promise.all(enqueuedTasks);
    logger.log("Successfully enqueued tasks");
  } catch (error) {
    logger.error("Error enqueuing tasks: ", error);
  }
}
