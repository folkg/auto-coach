import type { FeedbackData } from "@common/types/feedback.js";

import { getAuth } from "firebase-admin/auth";

import { sendFeedbackEmail } from "./email.service.js";

/**
 * Send feedback email from user
 *
 * @param feedbackData - The feedback data to send
 * @param uid - The user ID
 * @returns A boolean indicating success
 */
export async function sendUserFeedbackEmail(
  feedbackData: FeedbackData,
  uid: string,
): Promise<boolean> {
  try {
    // Get user email from Auth
    const user = await getAuth().getUser(uid);
    const userEmail = user.email || "Unknown Email";

    // Send feedback email using the core email service
    await sendFeedbackEmail(
      userEmail,
      feedbackData.feedbackType,
      feedbackData.title,
      feedbackData.message,
    );

    return true;
  } catch (error) {
    console.error("Error sending feedback email:", error);
    throw error;
  }
}
