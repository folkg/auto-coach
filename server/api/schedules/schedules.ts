import { Hono } from "hono";
import { arktypeValidator } from "@hono/arktype-validator";
import { Schedule } from "@common/src/types/shared";
import { Schedule as ScheduleSchema } from "@common/src/schemas/shared";

// Example: Replace with actual data access logic
async function getScheduleForToday(uid: string): Promise<Schedule> {
  // TODO: Replace with real Firestore or service call
  // This is a stub for demonstration
  return {
    date: new Date().toISOString().slice(0, 10),
    games: {
      mlb: [1, 2, 3],
      nba: [],
      nfl: [],
      nhl: [],
    },
  };
}

export const schedulesRoute = new Hono()
  .get("/", async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const schedule = await getScheduleForToday(uid);
      // Validate with ArkType schema at runtime
      ScheduleSchema.assert(schedule);
      return c.json(schedule);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });
