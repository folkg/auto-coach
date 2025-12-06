import { Firestore } from "@google-cloud/firestore";
import { expect, it } from "vitest";

import { createExecutionRoutes } from "./execution";

// Validation only; avoids executing downstream Firestore logic.

// Minimal Firestore stub if needed (can pass real, tests won't reach usage for invalid case)
const firestore = new Firestore();

it("returns validation error when task field missing in /mutation", async () => {
  // Arrange
  const app = createExecutionRoutes(firestore);
  const body = {
    // task omitted
  };

  // Act
  const res = await app.fetch(
    new Request("http://test/mutation", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );

  // Assert
  expect(res.status).toBe(400);
  const json = (await res.json()) as { success: boolean; error: unknown[] };
  expect(json.success).toBe(false);
  expect(json.error).toBeDefined();
});
