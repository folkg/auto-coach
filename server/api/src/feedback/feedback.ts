import { arktypeValidator } from "@hono/arktype-validator";
import { Hono } from "hono";
import type { AuthContext } from "../index";

export const feedbackRouter = new Hono<AuthContext>()

  /**
   * POST /api/feedback
   * Receive feedback from the authenticated user and send an email
   * Request: FeedbackData
   * Response: { success: boolean }
   */
  .post("/", arktypeValidator("json", FeedbackDataSchema), async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const _data = c.req.valid("json");
    try {
      await // TODO: Get from src/core
      return c.json({ success: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

export default feedbackRouter;
