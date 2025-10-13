import { getApps, initializeApp } from "firebase-admin/app";
import { getFunctions, type TaskQueue } from "firebase-admin/functions";
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { getFunctionUrl } from "../common/services/utilities.service.js";

if (getApps().length === 0) {
  initializeApp();
}

export const addmocktaskstoqueue = onRequest(async (req, res) => {
  let queue: TaskQueue<Record<string, unknown>>;
  let targetUri: string;
  try {
    queue = getFunctions().taskQueue("lineup-mockdispatchsetlineup");
    targetUri = await getFunctionUrl("lineup-mockdispatchsetlineup");
  } catch (error) {
    logger.error("Error getting task queue. ", error);
    return;
  }

  // Start enqueuing mock tasks
  const numTasks = Number.parseInt(req.query.numTasks as string, 10) || 10;
  const mockEnqueues: unknown[] = [];
  for (let i = 0; i < numTasks; i++) {
    const uid = `user_${i}`;
    const teams = [`team_${i}_1`, `team_${i}_2`];
    mockEnqueues.push(queue.enqueue({ uid, teams }, { uri: targetUri }));
  }

  try {
    // Wait for all mock tasks to be enqueued
    await Promise.all(mockEnqueues);
    logger.log("Successfully enqueued mock tasks");
  } catch (error) {
    logger.error("Error enqueuing or processing tasks: ", error);
  }
  res.end();
});
