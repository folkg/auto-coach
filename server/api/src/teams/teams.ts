import { type } from "arktype";
import { arktypeValidator } from "@hono/arktype-validator";
import { Hono } from "hono";
import type { AuthContext } from "../index";

// Define validators for request bodies
const BooleanValueSchema = type({
  value: "boolean",
});

// /api/teams router
const teamsRouter = new Hono<AuthContext>()

  /**
   * GET /api/teams
   * Fetch authenticated user's teams, combining data from Yahoo API and Firestore settings.
   * Response: Team[]
   */
  .get("/", async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      // Get user teams from core logic
      const { getUserTeams } = await import(
        "@core/src/fetchUsersTeams/services/getUserTeams.service.js"
      );
      const teams = await getUserTeams(uid);
      return c.json(teams);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  })

  /**
   * PUT /api/teams/:teamKey/lineup/setting
   * Update the is_setting_lineups boolean for a specific team in Firestore for the authenticated user.
   * Request: { value: boolean }
   * Response: { success: boolean }
   */
  .put(
    "/:teamKey/lineup/setting",
    arktypeValidator("json", BooleanValueSchema),
    async (c) => {
      const uid = c.get("uid");
      const teamKey = c.req.param("teamKey");
      if (!uid) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const { value } = c.req.valid("json");
      try {
        // Get updateTeamLineupSetting from core logic
        const { updateTeamLineupSetting } = await import(
          "@core/src/fetchUsersTeams/services/updateTeam.service.js"
        );
        const success = await updateTeamLineupSetting(uid, teamKey, value);
        return c.json({ success });
      } catch (error) {
        return c.json({ error: (error as Error).message }, 500);
      }
    }
  )

  /**
   * PUT /api/teams/:teamKey/lineup/paused
   * Update the lineup_paused_at timestamp for a specific team in Firestore for the authenticated user (pause/resume).
   * Request: { value: boolean }
   * Response: { success: boolean }
   */
  .put(
    "/:teamKey/lineup/paused",
    arktypeValidator("json", BooleanValueSchema),
    async (c) => {
      const uid = c.get("uid");
      const teamKey = c.req.param("teamKey");
      if (!uid) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const { value } = c.req.valid("json");
      try {
        // Get updateTeamLineupPaused from core logic
        const { updateTeamLineupPaused } = await import(
          "@core/src/fetchUsersTeams/services/updateTeam.service.js"
        );
        const success = await updateTeamLineupPaused(uid, teamKey, value);
        return c.json({ success });
      } catch (error) {
        return c.json({ error: (error as Error).message }, 500);
      }
    }
  );

export default teamsRouter;
