export { schedulecalcpositionalscarcity } from "../core/src/scheduleCalcPositionalScarcity/scheduleCalcPositionalScarcity.js";
export {
  gettransactions,
  posttransactions,
} from "../core/src/transactions/transactions.js";

// TODO: This is just for testing. Remove later.
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { getTransactions } from "../core/src/transactions/services/processTransactions.service.js";
export const testtx = onRequest(async (_req, res) => {
  const uid = "mzJVgridDRSG3zwFQxAuIhNro9V2"; // Jeff Barnes

  try {
    await getTransactions(uid);
  } catch (error) {
    logger.log("Error in testtx: ", error);
  }
  res.end();
});
