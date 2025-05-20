import { type } from "arktype";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createMiddleware } from "hono/factory";
import type { AuthContext } from ".";

// biome-ignore lint/complexity/useLiteralKeys: Angular build complains about this since it doesn't know about the server side env types
const FIREBASE_PROJECT_ID = process.env["FIREBASE_PROJECT_ID"];

const firebaseConfigSchema = type({
  projectId: "string",
});

const firebaseConfig = firebaseConfigSchema.assert({
  projectId: FIREBASE_PROJECT_ID,
});

const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const firebaseAuth = getAuth(firebaseApp);

export const firebaseAuthMiddleware = createMiddleware<AuthContext>(
  async (c, next) => {
    const authHeader = c.req.raw.headers.get("Authorization");
    const jwt = extractBearerToken(authHeader);

    if (!jwt) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    try {
      const decodedToken = await firebaseAuth.verifyIdToken(jwt);
      c.set("uid", decodedToken.uid);
      return next();
    } catch (error) {
      console.error("Firebase Auth failed", { error });
      return c.json({ error: "Invalid or expired Firebase token" }, 401);
    }
  },
);

function extractBearerToken(authHeader: string | null): string | null {
  return authHeader?.startsWith("Bearer ")
    ? authHeader.replace(/^Bearer\s+/i, "")
    : null;
}
