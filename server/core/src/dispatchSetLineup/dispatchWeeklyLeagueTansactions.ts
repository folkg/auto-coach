import { type } from "arktype";
import { logger } from "firebase-functions";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { FirestoreTeam } from "@common/types/team.js";
import { performWeeklyLeagueTransactions } from "./services/setLineups.service.js";

export const taskQueueConfig = {
  retryConfig: {
    maxAttempts: 2,
    minBackoffSeconds: 10,
    maxDoublings: 1,
  },
  rateLimits: {
    maxConcurrentDispatches: 5,
    maxDispatchesPerSecond: 5,
  },
};

const UIDSchema = type("string");

export const dispatchweeklyleaguetransactions = onTaskDispatched(taskQueueConfig, async (req) => {
  const uid = UIDSchema(req.data.uid);
  if (uid instanceof type.errors) {
    logger.warn("Invalid uid provided", uid.summary);
    return;
  }
  const teams = FirestoreTeam.array()(req.data.teams);
  if (teams instanceof type.errors) {
    logger.warn("Invalid teams provided", teams.summary);
    return;
  }

  try {
    return await performWeeklyLeagueTransactions(uid, teams);
  } catch (error) {
    logger.error(`Error performing weekly transactions for user ${uid}:`, error);
    logger.error("User's teams: ", teams);
  }
});
