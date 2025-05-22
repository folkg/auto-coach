import {
  PostTransactionsResult as PostTransactionsResultSchema,
  TransactionsData as TransactionsDataSchema,
} from "@common/src/schemas/shared";
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
      const data =
        await // TODO: Get from src/core
        // Validate with ArkType schema at runtime
        TransactionsDataSchema.assert(data);
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
  .post("/", arktypeValidator("json", TransactionsDataSchema), async (c) => {
    const uid = c.get("uid");
    if (!uid) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const _transactions = c.req.valid("json");
      const result =
        await // TODO: Get from src/core
        PostTransactionsResultSchema.assert(result);
      return c.json(result);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

export default transactionsRoute;
