import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { sendFeedbackEmail } from "../common/services/email/email.service.js";

export const sendfeedbackemail = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "User must be logged in to send feedback email",
    );
  }

  const data = request.data;
  if (!data) {
    throw new HttpsError(
      "invalid-argument",
      "Data must be provided to send feedback email",
    );
  }

  const { userEmail, feedbackType, title, message } = data;
  if (!(userEmail && feedbackType && title && message)) {
    throw new HttpsError(
      "invalid-argument",
      "All fields must be provided to send feedback email",
    );
  }

  let result = false;
  try {
    await sendFeedbackEmail(userEmail, feedbackType, title, message);
    result = true;
  } catch (error) {
    logger.error("feedback email failed to send: ", error);
  }
  return result;
});
