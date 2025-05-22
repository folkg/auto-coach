import { Hono } from "hono";
import { cors } from "hono/cors";
import feedbackRouter from "./feedback/feedback";
import { firebaseAuthMiddleware } from "./firebaseAuthMiddleware.js";
import schedulesRouter from "./schedules/schedules";
import teamsRouter from "./teams/teams";
import transactionsRouter from "./transactions/transactions";

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

const routes = app
  .get("/", (c) => c.text("Hello!"))
  .route("/api/teams", teamsRouter)
  .route("/api/schedules", schedulesRouter)
  .route("/api/feedback", feedbackRouter)
  .route("/api/transactions", transactionsRouter);

export type HonoAppType = typeof routes;
