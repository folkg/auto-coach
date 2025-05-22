import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  getTransactions,
  postTransactions,
} from "./services/processTransactions.service.js";

export const gettransactions = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to get an access token",
    );
  }
  return await getTransactions(uid);
});

export const posttransactions = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to get an access token",
    );
  }

  const transactions = request.data.transactions;
  if (!transactions) {
    throw new HttpsError(
      "invalid-argument",
      "You must provide dropPlayerTransactions, lineupChanges, and addSwapTransactions",
    );
  }

  return await postTransactions(transactions, uid);
});
