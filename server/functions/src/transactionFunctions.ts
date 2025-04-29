import { schedulecalcpositionalscarcity } from "./scheduleCalcPositionalScarcity/scheduleCalcPositionalScarcity.js";
import { getTransactions } from "./transactions/services/processTransactions.service.js";
import {
  gettransactions,
  posttransactions,
} from "./transactions/transactions.js";
export { gettransactions, posttransactions, schedulecalcpositionalscarcity };

// TODO: This is just for testing. Remove later.
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
export const testtx = onRequest(async (_req, res) => {
  const uid = "mzJVgridDRSG3zwFQxAuIhNro9V2"; // Jeff Barnes

  try {
    await getTransactions(uid);
  } catch (error) {
    logger.log("Error in testtx: ", error);
  }
  res.end();
});
