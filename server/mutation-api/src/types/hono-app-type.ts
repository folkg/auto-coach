import type { Hono } from "hono";

export interface AuthContext {
  Variables: {
    uid: string;
    requestId: string;
  };
}

export type HonoAppType = Hono<AuthContext>;
