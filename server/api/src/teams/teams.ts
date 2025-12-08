import {
  getUserTeams,
  getUserTeamsPartial,
} from "@core/fetchUsersTeams/services/getUserTeams.service.js";
import {
  updateTeamLineupPaused,
  updateTeamLineupSetting,
} from "@core/fetchUsersTeams/services/updateTeam.service.js";
import { arktypeValidator } from "@hono/arktype-validator";
import { type } from "arktype";
import { Hono } from "hono";

import type { AuthContext } from "../index";

import { handleRouteError } from "../routeErrorHandler";

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
    try {
      const teams = await getUserTeams(uid);
      return c.json(teams);
    } catch (error) {
      handleRouteError(error, { userId: uid, route: "/api/teams", method: "GET" });
    }
  })

  /**
   * GET /api/teams/partial
   * Fetch authenticated user's teams, returning just the Firestore settings
   * Response: FirestoreTeam[]
   */
  .get("/partial", async (c) => {
    const uid = c.get("uid");
    try {
      const teams = await getUserTeamsPartial(uid);
      return c.json(teams);
    } catch (error) {
      handleRouteError(error, { userId: uid, route: "/api/teams/partial", method: "GET" });
    }
  })

  /**
   * PUT /api/teams/:teamKey/lineup/setting
   * Update the is_setting_lineups boolean for a specific team in Firestore for the authenticated user.
   * Request: { value: boolean }
   * Response: { success: boolean }
   */
  .put("/:teamKey/lineup/setting", arktypeValidator("json", BooleanValueSchema), async (c) => {
    const uid = c.get("uid");
    const teamKey = c.req.param("teamKey");
    const { value } = c.req.valid("json");
    try {
      const success = await updateTeamLineupSetting(uid, teamKey, value);
      return c.json({ success });
    } catch (error) {
      handleRouteError(error, {
        userId: uid,
        route: `/api/teams/${teamKey}/lineup/setting`,
        method: "PUT",
      });
    }
  })

  /**
   * PUT /api/teams/:teamKey/lineup/paused
   * Update the lineup_paused_at timestamp for a specific team in Firestore for the authenticated user (pause/resume).
   * Request: { value: boolean }
   * Response: { success: boolean }
   */
  .put("/:teamKey/lineup/paused", arktypeValidator("json", BooleanValueSchema), async (c) => {
    const uid = c.get("uid");
    const teamKey = c.req.param("teamKey");
    const { value } = c.req.valid("json");
    try {
      const success = await updateTeamLineupPaused(uid, teamKey, value);
      return c.json({ success });
    } catch (error) {
      handleRouteError(error, {
        userId: uid,
        route: `/api/teams/${teamKey}/lineup/paused`,
        method: "PUT",
      });
    }
  });

export default teamsRouter;
