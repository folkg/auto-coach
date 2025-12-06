import { TransactionsData } from "@common/types/transactions";
import {
  getTransactionSuggestions,
  processSelectedTransactions,
} from "@core/transactions/services/transactionsApi.service.js";
import { arktypeValidator } from "@hono/arktype-validator";
import { Hono } from "hono";

import type { AuthContext } from "..";

import { handleRouteError } from "../yahooAuthErrorHandler";

export const transactionsRoute = new Hono<AuthContext>()

  /**
   * GET /api/transactions
   * Generate and fetch suggested transactions for the authenticated user
   * Response: TransactionsData
   */
  .get("/", async (c) => {
    const uid = c.get("uid");
    try {
      const data = await getTransactionSuggestions(uid);
      return c.json(data);
    } catch (error) {
      handleRouteError(error);
    }
  })

  /**
   * POST /api/transactions
   * Process selected transactions for the authenticated user with the Yahoo Fantasy API
   * Request: TransactionsData (containing only selected transactions)
   * Response: PostTransactionsResult
   */
  .post("/", arktypeValidator("json", TransactionsData), async (c) => {
    const uid = c.get("uid");
    try {
      const transactions = c.req.valid("json");
      const result = await processSelectedTransactions(transactions, uid);
      return c.json(result);
    } catch (error) {
      handleRouteError(error);
    }
  });

export default transactionsRoute;
