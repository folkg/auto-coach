import { InjectionToken } from "@angular/core";
import type { HonoAppType } from "@server/api/dist/types/hono-app-type";
import { getAuth, getIdToken } from "firebase/auth";
import { hc } from "hono/client";

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env["NG_APP_API_BASE_URL"];
  // If env URL is explicitly set to empty string, use same origin (production)
  if (envUrl === "") {
    return ""; // Production: use Firebase Hosting rewrites (same origin)
  }
  // Otherwise use the configured URL (development)
  return envUrl ?? "http://localhost:3000";
};

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

const client = hc<HonoAppType>(getApiBaseUrl());
type HonoClient = typeof client;

// https://hono.dev/docs/guides/rpc#compile-your-code-before-using-it-recommended
const hcWithType = (...args: Parameters<typeof hc>): HonoClient =>
  hc<HonoAppType>(...args);

const honoClient = hcWithType(getApiBaseUrl(), { fetch: customFetch });

export const HONO_CLIENT = new InjectionToken<HonoClient>("Hono Client", {
  providedIn: "root",
  factory: () => honoClient,
});
