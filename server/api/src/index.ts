import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import feedbackRouter from "./feedback/feedback";
import { firebaseAuthMiddleware } from "./firebaseAuthMiddleware";
import schedulesRouter from "./schedules/schedules";
import teamsRouter from "./teams/teams";
import transactionsRouter from "./transactions/transactions";

console.log("Starting server...");

export type AuthContext = {
  Variables: {
    uid: string;
  };
};

const app = new Hono<AuthContext>();

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

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;
    try {
      const body = JSON.parse(err.message);
      return c.json(body, status);
    } catch {
      return c.json({ error: err.message }, status);
    }
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const routes = app
  .get("/", (c) => c.json({ status: "ok" }))
  .get("/health", (c) => c.body(null, 200))
  .use("/api/*", firebaseAuthMiddleware)
  .route("/api/teams", teamsRouter)
  .route("/api/schedules", schedulesRouter)
  .route("/api/feedback", feedbackRouter)
  .route("/api/transactions", transactionsRouter);

export type HonoAppType = typeof routes;

export default {
  fetch: app.fetch,
  port: Number(process.env.PORT || 3000),
};
