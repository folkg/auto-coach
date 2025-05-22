import { TransactionsData } from "@common/src/schemas/shared";
import { arktypeValidator } from "@hono/arktype-validator";
import { Hono } from "hono";
import type { AuthContext } from "..";

export const transactionsRoute = new Hono<AuthContext>()

  /**
   * GET /api/transactions
   * Generate and fetch suggested transactions for the authenticated user
   * Response: TransactionsData
   */
  .get("/", async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      // Get transaction suggestions from core logic
      const { getTransactionSuggestions } = await import(
        "@core/src/transactions/services/transactionsApi.service.js"
      );
      const data = await getTransactionSuggestions(uid);

      return c.json(data);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
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
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const transactions = c.req.valid("json");

      const { processSelectedTransactions } = await import(
        "@core/src/transactions/services/transactionsApi.service.js"
      );
      const result = await processSelectedTransactions(transactions, uid);
      return c.json(result);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

export default transactionsRoute;
