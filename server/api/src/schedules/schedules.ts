import { Schedule as ScheduleSchema } from "@common/src/schemas/shared";
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
      const schedule = // TODO: Get from src/core
        // Validate with ArkType schema at runtime
        ScheduleSchema.assert(schedule);
      return c.json(schedule);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

export default schedulesRouter;
