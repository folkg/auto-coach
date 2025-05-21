import { arktypeValidator } from "@hono/arktype-validator";
import { type } from "arktype";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { firebaseAuthMiddleware } from "./firebaseAuthMiddleware.js";

// Import routers for each domain
import teamsRouter from "../teams/teams.js";
import schedulesRouter from "../schedules/schedules.js";
import feedbackRouter from "../feedback/feedback.js";
import transactionsRouter from "../transactions/transactions.js";

export type AuthContext = {
  Variables: {
    uid?: string;
  };
};

const app = new Hono<AuthContext>();

// biome-ignore lint/complexity/useLiteralKeys: Angular build complains about this since it doesn't know about the server side env types
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
app.use("*", firebaseAuthMiddleware);

// Root route for health check
app.get("/", (c) => c.text("Hello AutoCoach!"));

// Wire up domain routers
app.route("/api/teams", teamsRouter);
app.route("/api/schedules", schedulesRouter);
app.route("/api/feedback", feedbackRouter);
app.route("/api/transactions", transactionsRouter);

export type HonoAppType = typeof app;

export default app;
