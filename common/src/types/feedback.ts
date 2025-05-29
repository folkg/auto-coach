import { type } from "arktype";

export const FeedbackData = type({
  userEmail: "string",
  feedbackType: "string",
  title: "string",
  message: "string",
});
export type FeedbackData = typeof FeedbackData.infer;
