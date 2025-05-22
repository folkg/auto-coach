import { FeedbackData } from "@common/src/schemas/shared";
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
  .post("/", arktypeValidator("json", FeedbackData), async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const data = c.req.valid("json");
    try {
      const { sendUserFeedbackEmail } = await import(
        "@core/src/common/services/email/feedbackEmail.service.js"
      );
      const success = await sendUserFeedbackEmail(data, uid);
      return c.json({ success });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

export default feedbackRouter;
