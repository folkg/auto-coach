import { Hono } from "hono";
import type { AuthContext } from "../index";

const schedulesRouter = new Hono<AuthContext>()

  /**
   * GET /api/schedules
   * Fetch daily game schedule data from Firestore
   * Response: Schedule
   */
  .get("/", async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const { getSchedule } = await import(
        "@core/src/scheduleSetLineup/services/getSchedule.service.js"
      );
      const schedule = await getSchedule(uid);
      return c.json(schedule);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  });

export default schedulesRouter;
