import { expect, it } from "vitest";

import { createDispatchRoutes } from "./dispatch";

// Only testing validation layer; success path would require external services.
// Arrange-Act-Assert sections explicitly separated.

it("returns validation error when userId missing in set-lineup", async () => {
  // Arrange
  const app = createDispatchRoutes();
  const body = {
    teamKey: "team-1",
    lineupChanges: [],
  };

  // Act
  const res = await app.fetch(
    new Request("http://test/set-lineup", {
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

it("returns validation error when teamKey missing in weekly-transactions", async () => {
  // Arrange
  const app = createDispatchRoutes();
  const body = {
    userId: "user-1",
    // teamKey omitted
    transactions: [],
  };

  // Act
  const res = await app.fetch(
    new Request("http://test/weekly-transactions", {
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

it("returns validation error when leagueKey missing in calc-positional-scarcity", async () => {
  // Arrange
  const app = createDispatchRoutes();
  const body = {
    userId: "user-1",
    // leagueKey omitted
  };

  // Act
  const res = await app.fetch(
    new Request("http://test/calc-positional-scarcity", {
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
