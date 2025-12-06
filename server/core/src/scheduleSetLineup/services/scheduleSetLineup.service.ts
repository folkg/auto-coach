import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFunctions, type TaskQueue } from "firebase-admin/functions";
import { logger } from "firebase-functions";

import { getActiveTeamsForLeagues } from "../../common/services/firebase/firestore.service.js";
import { getCurrentPacificHour, getFunctionUrl } from "../../common/services/utilities.service.js";
import {
  enqueueUsersTeams,
  leaguesToSetLineupsFor,
  mapUsersToActiveTeams,
  setStartingPlayersForToday,
  setTodaysPostponedTeams,
} from "./scheduling.service.js";

if (getApps().length === 0) {
  initializeApp();
}

export function isFirstRunOfTheDay(): boolean {
  return getCurrentPacificHour() === 1;
}

export async function scheduleSetLineup() {
  const initializeGlobalDataPromises: Promise<void>[] = [];

  // We want the first run of the function to be at 1:55 AM Pacific Time
  // Waiver claims hadn't been fully proceseed at 0:55 AM
  if (getCurrentPacificHour() === 0) {
    return;
  }

  const leagues = await leaguesToSetLineupsFor();
  if (leagues.length === 0) {
    logger.log("No leagues to set lineups for.");
    return;
  }

  initializeGlobalDataPromises.push(setTodaysPostponedTeams(leagues));

  let teamsSnapshot: QuerySnapshot<DocumentData>;
  try {
    teamsSnapshot = await getActiveTeamsForLeagues(leagues);
  } catch (error) {
    logger.error(`Error fetching teams from Firebase for Leagues: ${leagues.join(", ")}`, error);
    return;
  }

  initializeGlobalDataPromises.push(setStartingPlayersForToday(teamsSnapshot));

  const activeUsers: Map<string, DocumentData> = mapUsersToActiveTeams(teamsSnapshot);
  if (activeUsers.size === 0) {
    logger.log("No users to set lineups for");
    return;
  }

  let queue: TaskQueue<Record<string, unknown>>;
  let targetUri: string;
  try {
    queue = getFunctions().taskQueue("lineup-dispatchsetlineup");
    targetUri = await getFunctionUrl("lineup-dispatchsetlineup");
  } catch (error) {
    logger.error("Error getting task queue. ", error);
    return;
  }

  // Wait for all the global data to be initialized before enqueuing tasks
  await Promise.all(initializeGlobalDataPromises);

  try {
    const enqueuedTasks = enqueueUsersTeams(activeUsers, queue, targetUri);
    await Promise.all(enqueuedTasks);
    logger.log("Successfully enqueued tasks");
  } catch (error) {
    logger.error("Error enqueuing tasks: ", error);
  }
}
