import { onSchedule } from "firebase-functions/v2/scheduler";
import { recalculateScarcityOffsetsForAll } from "../calcPositionalScarcity/services/positionalScarcity.service.js";

// Runs every Sunday at 12:30am PST
export const schedulecalcpositionalscarcity = onSchedule(
  { schedule: "30 0 * * 0", timeZone: "America/Los_Angeles" },
  async () => {
    await recalculateScarcityOffsetsForAll();
  },
);
