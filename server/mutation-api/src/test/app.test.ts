import { describe, expect, it } from "vitest";

import { app } from "../index";

describe("Hono App", () => {
  it("returns health check", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("returns root status", async () => {
    const res = await app.request("/");
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "ok" });
  });

  it("handles 404 for unknown routes", async () => {
    const res = await app.request("/unknown");
    expect(res.status).toBe(404);
  });
});
