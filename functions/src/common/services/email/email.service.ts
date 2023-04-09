import { auth } from "firebase-admin";
import { logger } from "firebase-functions";
import { AuthUserRecord } from "firebase-functions/lib/common/providers/identity";

const sgMail = require("@sendgrid/mail");
require("dotenv").config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Send an email to the AutoCoach gmail account from the client UI
 *
 * @export
 * @async
 * @param {string} userEmail The email address of the user sending the email
 * @param {string} feedbackType The type of feedback being sent
 * @param {string} title The title of the email
 * @param {string} message The message of the email
 * @return {Promise<boolean>} The result of the email send
 */
export async function sendFeedbackEmail(
  userEmail: string,
  feedbackType: string,
  title: string,
  message: string
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
  } catch (error) {
    logger.error("feedback email failed to send: ", error);
    throw new Error("Failed to send feedback email");
  }
  return true;
}

/**
 * Send an email to the user
 *
 * @export
 * @async
 * @param {string} uid The user id of the user to send the email to
 * @param {string} subject The title of the email
 * @param {string} body The message of the email
 * @param {string} [buttonText=""] The text of the button
 * @param {string} [buttonUrl=""] The url of the button
 * @return {Promise<boolean>} The result of the email send
 */
export async function sendUserEmail(
  uid: string,
  subject: string,
  body: any[],
  buttonText = "",
  buttonUrl = ""
): Promise<boolean> {
  const user = await auth().getUser(uid);
  if (!user) {
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
    return true;
  } catch (error) {
    logger.error(`user email failed to send to ${userEmailAddress}: `, error);
    return false;
  }
}

export async function sendCustomVerificationEmail(
  user: AuthUserRecord
): Promise<boolean> {
  const userEmailAddress = user?.email;
  if (!userEmailAddress) {
    throw new Error("Not a valid user");
  }
  const verificationLink = await auth().generateEmailVerificationLink(
    userEmailAddress
  );

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
    return true;
  } catch (error) {
    logger.error("Welcome email failed to send for new user", error);
    return false;
  }
}
