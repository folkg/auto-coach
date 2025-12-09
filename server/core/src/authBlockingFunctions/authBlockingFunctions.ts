import { logger } from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";

import type { FirestoreUser } from "./interfaces/FirestoreUser.js";

import { sendCustomVerificationEmail } from "../common/services/email/email.service.js";
import { db } from "../common/services/firebase/firestore.service.js";

export const beforeSignInV1 = functionsV1.auth.user().beforeSignIn(async (user, context) => {
  const credential = context.credential;
  if (credential) {
    const uid = user.uid;
    const data: FirestoreUser = {
      accessToken: credential.accessToken ?? "",
      refreshToken: credential.refreshToken ?? "",
      tokenExpirationTime: Date.parse(credential.expirationTime as string),
      subscriptionExpirationTime: -1,
      isFreeTrialActivated: false,
    };

    try {
      await db.collection("users").doc(uid).set(data);
    } catch (error) {
      logger.error(`Error saving login token credentials in Firestore for user ${uid}`, error);
    }
  }
});

export const beforeCreateV1 = functionsV1.auth.user().beforeCreate((user) => {
  // force all users to verify their email addresses initially
  if (user) {
    return {
      emailVerified: false,
    };
  }
  return {};
});

export const onCreateV1 = functionsV1.auth.user().onCreate(async (user) => {
  if (user) {
    return await sendCustomVerificationEmail(user);
  }
  return false;
});

// import { beforeUserCreated } from "firebase-functions/v2/identity";

// export const beforecreate = beforeUserCreated((event) => {
//   const credential = event.credential;
//   if (credential) {
//     const uid = event.data.uid;
//     const data = {
//       accessToken: credential.accessToken,
//       refreshToken: credential.refreshToken,
//       tokenExpirationTime: Date.parse(credential.expirationTime as string),
//     };

//     db.collection("users").doc(uid).set(data);
//   }
// });
