import { arktypeValidator } from "@hono/arktype-validator";
import { type } from "arktype";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { firebaseAuthMiddleware } from "./firebaseAuthMiddleware.js";

// TODO: Other routes, possibly in their own files
const indexApp = new Hono<AuthContext>();

const postSchema = type({
  name: "string",
  age: "number",
});

const indexRoute = indexApp
  .get("/", (c) => {
    return c.text("Hello AutoCoach!");
  })
  .post("/author", arktypeValidator("json", postSchema), (c) => {
    const { name, age } = c.req.valid("json");
    return c.json({
      success: true,
      message: `${name} is ${age}`,
    });
  });

// The main app
export type AuthContext = {
  Variables: {
    uid?: string;
  };
};

const app = new Hono<AuthContext>();

// set middleware
// biome-ignore lint/complexity/useLiteralKeys: Angular build complains about this since it doesn't know about the server side env types
const allowedOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
    credentials: true,
  }),
);
app.use("*", firebaseAuthMiddleware);

const routes = app.route("/", indexRoute);

export type HonoAppType = typeof routes;

export default app;
