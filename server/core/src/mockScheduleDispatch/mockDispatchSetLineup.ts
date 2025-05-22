import { logger } from "firebase-functions";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { initStartingGoalies } from "../common/services/yahooAPI/yahooStartingPlayer.service.js";
import { taskQueueConfig } from "../dispatchSetLineup/dispatchSetLineup.js";

export const mockdispatchsetlineup = onTaskDispatched(
  taskQueueConfig,
  async (req) => {
    const uid: string = req.data.uid;
    const teams: string[] = req.data.teams;
    if (!uid) {
      logger.log("No uid provided");
      return;
    }
    if (!teams) {
      logger.log("No teams provided");
      return;
    }

    // fetch starting goalies, just to test how often it is called
    await initStartingGoalies();
    // await initStartingPitchers();

    // approximate the time it takes to process a task (~3200ms from cloud logs, give or take)
    await new Promise((resolve) => setTimeout(resolve, 3500));
    logger.log(
      `Successfully processed mock task for uid: ${uid} and teams: ${teams}`,
    );
  },
);
