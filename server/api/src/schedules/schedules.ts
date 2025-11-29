import { Hono } from "hono";
import { getErrorMessage } from "@common/utilities/error";
import { getSchedule } from "@core/scheduleSetLineup/services/getSchedule.service.js";
import type { AuthContext } from "../index";

const schedulesRouter = new Hono<AuthContext>()

  /**
   * GET /api/schedules
   * Fetch daily game schedule data from Firestore
   * Response: Schedule
   */
  .get("/", async (c) => {
    const uid = c.get("uid");
    try {
      const schedule = await getSchedule(uid);
      return c.json(schedule);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 500);
    }
  });

export default schedulesRouter;
