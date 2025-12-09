import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";

import { structuredLogger } from "../structured-logger.js";

dotenv.config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? "");

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Send an email to the AutoCoach gmail account from the client UI
 *
 * @export
 * @async
 * @param userEmail The email address of the user sending the email
 * @param feedbackType The type of feedback being sent
 * @param title The title of the email
 * @param message The message of the email
 * @return The result of the email send
 */
export async function sendFeedbackEmail(
  userEmail: string,
  feedbackType: string,
  title: string,
  message: string,
): Promise<boolean> {
  const templateData = {
    feedbackType,
    title,
    message,
  };

  const msg = {
    to: "customersupport@fantasyautocoach.com",
    from: "Fantasy AutoCoach User Feedback <feedback@fantasyautocoach.com>",
    replyTo: userEmail,
    templateId: "d-f99cd8e8058f44dc83c74c523cc92840",
    dynamicTemplateData: templateData,
  };

  try {
    await sgMail.send(msg);
    structuredLogger.info("Feedback email sent successfully", {
      phase: "email",
      service: "sendgrid",
      event: "FEEDBACK_EMAIL_SENT",
      operation: "sendFeedbackEmail",
      toEmail: "customersupport@fantasyautocoach.com",
      fromEmail: userEmail,
      feedbackType,
      outcome: "success",
    });
    return true;
  } catch (error) {
    const sendgridError = error as { code?: number; response?: { body?: { errors?: unknown[] } } };
    structuredLogger.error(
      "Feedback email failed to send",
      {
        phase: "email",
        service: "sendgrid",
        event: "FEEDBACK_EMAIL_FAILED",
        operation: "sendFeedbackEmail",
        fromEmail: userEmail,
        feedbackType,
        errorCode: sendgridError.code ? `SENDGRID_${sendgridError.code}` : "SENDGRID_UNKNOWN",
        outcome: "unhandled-error",
        terminated: true,
      },
      error,
    );
    throw new Error(`Failed to send feedback email ${error}`);
  }
}

/**
 * Send an email to the user
 *
 * @export
 * @async
 * @param uid The user id of the user to send the email to
 * @param subject The title of the email
 * @param body The message of the email
 * @param buttonText The text of the button
 * @param buttonUrl The url of the button
 * @return The result of the email send
 */
export async function sendUserEmail(
  uid: string,
  subject: string,
  body: unknown[],
  buttonText = "",
  buttonUrl = "",
): Promise<boolean> {
  const user = await getAuth().getUser(uid);
  if (!user) {
    structuredLogger.error("Cannot send email - user not found", {
      phase: "email",
      service: "firebase",
      event: "USER_NOT_FOUND",
      operation: "sendUserEmail",
      userId: uid,
      outcome: "unhandled-error",
      terminated: true,
    });
    throw new Error("Not a valid user");
  }
  const userEmailAddress = user.email;
  const displayName = user.displayName;

  const templateData = {
    displayName,
    body,
    subject,
    buttonText,
    buttonUrl,
  };

  const msg = {
    to: userEmailAddress,
    from: "Fantasy AutoCoach <customersupport@fantasyautocoach.com>",
    templateId: "d-68da1ae2303d4400b9eabad0a034c262",
    dynamicTemplateData: templateData,
  };

  try {
    await sgMail.send(msg);
    structuredLogger.info("User email sent successfully", {
      phase: "email",
      service: "sendgrid",
      event: "USER_EMAIL_SENT",
      operation: "sendUserEmail",
      userId: uid,
      toEmail: userEmailAddress,
      subject,
      outcome: "success",
    });
    return true;
  } catch (error) {
    const sendgridError = error as { code?: number; response?: { body?: { errors?: unknown[] } } };
    structuredLogger.error(
      "User email failed to send",
      {
        phase: "email",
        service: "sendgrid",
        event: "USER_EMAIL_FAILED",
        operation: "sendUserEmail",
        userId: uid,
        toEmail: userEmailAddress,
        subject,
        errorCode: sendgridError.code ? `SENDGRID_${sendgridError.code}` : "SENDGRID_UNKNOWN",
        outcome: "handled-error",
        terminated: false,
      },
      error,
    );
    return false;
  }
}

export async function sendCustomVerificationEmail(user: UserRecord): Promise<boolean> {
  const userEmailAddress = user?.email;
  if (!userEmailAddress) {
    structuredLogger.error("Cannot send verification email - no email address", {
      phase: "email",
      event: "VERIFICATION_EMAIL_NO_ADDRESS",
      operation: "sendCustomVerificationEmail",
      outcome: "unhandled-error",
      terminated: true,
    });
    throw new Error("Not a valid user");
  }

  let verificationLink: string;
  try {
    verificationLink = await getAuth().generateEmailVerificationLink(userEmailAddress);
  } catch (error) {
    structuredLogger.error(
      "Failed to generate email verification link",
      {
        phase: "email",
        service: "firebase",
        event: "VERIFICATION_LINK_GENERATION_FAILED",
        operation: "sendCustomVerificationEmail",
        toEmail: userEmailAddress,
        outcome: "unhandled-error",
        terminated: true,
      },
      error,
    );
    throw new Error(`Failed to generate email verification link ${error}`);
  }

  const templateData = {
    displayName: user?.displayName,
    verificationLink,
  };

  const msg = {
    to: userEmailAddress,
    from: "Fantasy AutoCoach <customersupport@fantasyautocoach.com>",
    templateId: "d-92a139e3829b43f5b7ce6b0645336a85",
    dynamicTemplateData: templateData,
  };

  try {
    await sgMail.send(msg);
    structuredLogger.info("Welcome/verification email sent successfully", {
      phase: "email",
      service: "sendgrid",
      event: "VERIFICATION_EMAIL_SENT",
      operation: "sendCustomVerificationEmail",
      toEmail: userEmailAddress,
      displayName: user?.displayName,
      outcome: "success",
    });
    return true;
  } catch (error) {
    const sendgridError = error as { code?: number; response?: { body?: { errors?: unknown[] } } };
    structuredLogger.error(
      "Welcome email failed to send",
      {
        phase: "email",
        service: "sendgrid",
        event: "VERIFICATION_EMAIL_FAILED",
        operation: "sendCustomVerificationEmail",
        toEmail: userEmailAddress,
        displayName: user?.displayName,
        errorCode: sendgridError.code ? `SENDGRID_${sendgridError.code}` : "SENDGRID_UNKNOWN",
        outcome: "unhandled-error",
        terminated: true,
      },
      error,
    );
    throw new Error(`Failed to send welcome email: ${error}`);
  }
}
