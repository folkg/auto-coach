import { Effect } from "effect";
import { Hono } from "hono";
import { cors } from "hono/cors";

import mutationsRouter from "./routes/mutations";
import { ProductionLoggerLayer } from "./services/logger.service";

// Log server startup with structured logging
Effect.runSync(
  Effect.logInfo("Starting Mutation API server").pipe(
    Effect.annotateLogs("event", "SERVER_STARTUP"),
    Effect.annotateLogs("port", Number(process.env.PORT || 3001)),
    Effect.provide(ProductionLoggerLayer),
  ),
);

const app = new Hono();

const allowedOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
    credentials: true,
  }),
);

const routes = app
  .get("/", (c) => c.json({ status: "ok" }))
  .get("/health", (c) => c.body(null, 200))
  .route("/mutations", mutationsRouter);

export type HonoAppType = typeof routes;
export { app };

export default {
  fetch: app.fetch,
  port: Number(process.env.PORT || 3001),
};
