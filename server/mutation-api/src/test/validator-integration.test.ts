import { Schema } from "effect";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { effectValidator } from "@hono/effect-validator";

const TestSchema = Schema.Struct({
  userId: Schema.String,
  teamKey: Schema.String,
});

const validateTest = effectValidator("json", TestSchema);

describe("effectValidator integration test", () => {
  it("should validate and provide typed data", async () => {
    const app = new Hono();
    app.post("/test", validateTest, (c) => {
      const data = c.req.valid("json");
      return c.json(data);
    });

    const response = await app.fetch(
      new Request("http://test/test", {
        method: "POST",
        body: JSON.stringify({ userId: "user-123", teamKey: "team-456" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ userId: "user-123", teamKey: "team-456" });
  });

  it("should return 400 for invalid data", async () => {
    const app = new Hono();
    app.post("/test", validateTest, (c) => {
      const data = c.req.valid("json");
      return c.json(data);
    });

    const response = await app.fetch(
      new Request("http://test/test", {
        method: "POST",
        body: JSON.stringify({ userId: "user-123" }), // missing teamKey
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
  });
});
