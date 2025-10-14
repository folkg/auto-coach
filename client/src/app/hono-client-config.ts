import { InjectionToken } from "@angular/core";
import type { HonoAppType } from "@server/api/dist/types/hono-app-type";
import { getAuth, getIdToken } from "firebase/auth";
import { hc } from "hono/client";

const API_BASE_URL = "";

const customFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const auth = getAuth();
  const user = auth.currentUser;
  const headers = new Headers(init?.headers);

  if (user) {
    try {
      const token = await getIdToken(user, true);
      headers.set("Authorization", `Bearer ${token}`);
    } catch (error) {
      console.error("Error getting ID token:", error);
      return new Response(null, { status: 403, statusText: "Forbidden" });
    }
  } else {
    console.error("No user");
    return new Response(null, { status: 403, statusText: "Forbidden" });
  }

  const modifiedInit = { ...init, headers };
  return fetch(input, modifiedInit);
};

const client = hc<HonoAppType>("");
type HonoClient = typeof client;

// https://hono.dev/docs/guides/rpc#compile-your-code-before-using-it-recommended
const hcWithType = (...args: Parameters<typeof hc>): HonoClient =>
  hc<HonoAppType>(...args);

const honoClient = hcWithType(API_BASE_URL, { fetch: customFetch });

export const HONO_CLIENT = new InjectionToken<HonoClient>("Hono Client", {
  providedIn: "root",
  factory: () => honoClient,
});
