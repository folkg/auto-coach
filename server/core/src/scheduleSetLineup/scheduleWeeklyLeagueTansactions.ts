import { onSchedule } from "firebase-functions/v2/scheduler";

import { scheduleWeeklyLeagueTransactions } from "./services/scheduleWeeklyLeagueTansactions.service.js";

// hour 03 = 8pm PST / 9pm PDT every day. Somewhat arbitrary, just wanted later in the day.
export const scheduleweeklyleaguetransactions = onSchedule("0 03 * * *", async () => {
  await scheduleWeeklyLeagueTransactions();
});
