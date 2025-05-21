import { arktypeValidator } from "@hono/arktype-validator";
import { FeedbackData } from "@common/src/types/shared";
import { FeedbackData as FeedbackDataSchema } from "@common/src/schemas/shared";
import { Hono } from "hono";
import type { AuthContext } from "../src";
import { sendFeedbackEmail } from "../../core/domains/feedback/sendFeedbackEmail";

export const feedbackRouter = new Hono<AuthContext>();

feedbackRouter.post(
  "/",
  arktypeValidator("json", FeedbackDataSchema),
  async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const data = c.req.valid("json") as FeedbackData;
    try {
      await sendFeedbackEmail(data, uid);
      return c.json({ success: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500,
      );
    }
  },
);

export default feedbackRouter;
