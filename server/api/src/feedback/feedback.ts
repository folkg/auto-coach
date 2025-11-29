import { Hono } from "hono";
import { FeedbackData } from "@common/types/feedback";
import { getErrorMessage } from "@common/utilities/error";
import { sendUserFeedbackEmail } from "@core/common/services/email/feedbackEmail.service.js";
import { arktypeValidator } from "@hono/arktype-validator";
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
    const data = c.req.valid("json");
    try {
      const success: boolean = await sendUserFeedbackEmail(data, uid);
      return c.json<{ success: boolean }>({ success });
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 500);
    }
  });

export default feedbackRouter;
