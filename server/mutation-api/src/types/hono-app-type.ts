import type { Hono } from "hono";

export interface AuthContext {
  Variables: {
    uid: string;
  };
}

export type HonoAppType = Hono<AuthContext>;
