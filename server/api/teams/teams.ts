import { Hono } from "hono";
import { arktypeValidator } from "@hono/arktype-validator";
import { Team, TeamFirestore } from "@common/src/types/shared";
import { Team as TeamSchema } from "@common/src/schemas/shared";
import type { AuthContext } from "../src";
import { getUserTeams } from "../../core/domains/teams/getUserTeams";

// /api/teams router
const teamsRouter = new Hono<AuthContext>();

/**
 * GET /api/teams
 * Fetch authenticated user's teams, combining data from Yahoo API and Firestore settings.
 * Response: Team[]
 */
teamsRouter.get("/", async (c) => {
  const uid = c.get("uid");
  if (!uid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // getUserTeams should return Team[]
    const teams = await getUserTeams(uid);
    // Validate response with ArkType schema
    if (!Array.isArray(teams) || !teams.every((t) => TeamSchema(t))) {
      return c.json({ error: "Invalid teams data" }, 500);
    }
    return c.json(teams);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * PUT /api/teams/:teamKey/lineup/setting
 * Update the is_setting_lineups boolean for a specific team in Firestore for the authenticated user.
 * Request: { value: boolean }
 * Response: { success: boolean }
 */
teamsRouter.put("/:teamKey/lineup/setting", arktypeValidator("json", { value: "boolean" }), async (c) => {
  const uid = c.get("uid");
  const teamKey = c.req.param("teamKey");
  if (!uid) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { value } = c.req.valid("json");
  try {
    // updateTeamLineupSetting should update Firestore and return success boolean
    const { updateTeamLineupSetting } = await import("../../core/domains/teams/updateTeamLineupSetting");
    const success = await updateTeamLineupSetting(uid, teamKey, value);
    return c.json({ success });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

/**
 * PUT /api/teams/:teamKey/lineup/paused
 * Update the lineup_paused_at timestamp for a specific team in Firestore for the authenticated user (pause/resume).
 * Request: { value: boolean }
 * Response: { success: boolean }
 */
teamsRouter.put("/:teamKey/lineup/paused", arktypeValidator("json", { value: "boolean" }), async (c) => {
  const uid = c.get("uid");
  const teamKey = c.req.param("teamKey");
  if (!uid) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { value } = c.req.valid("json");
  try {
    // updateTeamLineupPaused should update Firestore and return success boolean
    const { updateTeamLineupPaused } = await import("../../core/domains/teams/updateTeamLineupPaused");
    const success = await updateTeamLineupPaused(uid, teamKey, value);
    return c.json({ success });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

export default teamsRouter;
