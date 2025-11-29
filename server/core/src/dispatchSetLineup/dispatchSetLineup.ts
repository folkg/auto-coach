import { type } from "arktype";
import { logger } from "firebase-functions";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { FirestoreTeam } from "@common/types/team.js";
import { RevokedRefreshTokenError } from "../common/services/firebase/errors.js";
import { setUsersLineup } from "./services/setLineups.service.js";

export const taskQueueConfig = {
  retryConfig: {
    maxAttempts: 5,
    minBackoffSeconds: 10,
    maxDoublings: 4,
  },
  rateLimits: {
    maxDispatchesPerSecond: 5,
    maxConcurrentDispatches: 40,
  },
};

const UIDSchema = type("string");

export const dispatchsetlineup = onTaskDispatched(taskQueueConfig, async (req) => {
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
    return await setUsersLineup(uid, teams);
  } catch (error) {
    if (error instanceof RevokedRefreshTokenError) {
      logger.log(error);
    } else {
      logger.error(`Error setting lineup for user ${uid}:`, error);
      logger.error("User's teams: ", teams);
    }
  }
});
