import { Firestore } from "@google-cloud/firestore";
import { Hono } from "hono";

import type { AuthContext } from "../types/hono-app-type";

import { createDispatchRoutes } from "./dispatch";
import { createExecutionRoutes } from "./execution";

const mutations = new Hono<AuthContext>();

// Health check
mutations.get("/", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount sub-routes
mutations.route("/execute", createExecutionRoutes(new Firestore()));
// Mount dispatch routes directly (no /dispatch prefix)
mutations.route("/", createDispatchRoutes());

export default mutations;
