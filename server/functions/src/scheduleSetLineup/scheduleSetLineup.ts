import { onSchedule } from "firebase-functions/v2/scheduler";
import { scheduleSetLineup } from "./services/scheduleSetLineup.service.js";

export const schedulesetlineup = onSchedule("55 * * * *", async () => {
  await scheduleSetLineup();
});
