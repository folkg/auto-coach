import { ApiRateLimitError, AuthorizationError } from "@common/utilities/error.js";

import { loadYahooAccessToken } from "../firebase/firestore.service.js";
import { structuredLogger } from "../structured-logger.js";

const API_URL = "https://fantasysports.yahooapis.com/fantasy/v2/";

/** Rate limit status codes from Yahoo API */
const RATE_LIMIT_STATUS_CODES = [429, 999];

/** Auth error status codes from Yahoo API */
const AUTH_ERROR_STATUS_CODES = [401, 403];

/**  Somewhat arbitrary - experimentally Observed to be finished at 3:03 AM some mornings */
const YAHOO_MAINTENANCE_RETRY_AFTER_SECONDS = 8 * 60;
const YAHOO_MAINTENANCE_INDICATOR = "site is currently in read-only mode";

interface HttpResponse<T> {
  readonly data: T;
  readonly status: number;
}

/**
 * Custom error class for HTTP errors
 */
export class HttpError extends Error {
  readonly response?: {
    readonly data: unknown;
    readonly status: number;
  };

  constructor(message: string, response?: { readonly data: unknown; readonly status: number }) {
    super(message);
    this.name = "HttpError";
    this.response = response;
  }
}

/**
 * Error thrown when Yahoo API is in maintenance/read-only mode.
 */
export class YahooMaintenanceError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds = YAHOO_MAINTENANCE_RETRY_AFTER_SECONDS) {
    super(message);
    this.name = "YahooMaintenanceError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isYahooMaintenanceError(error: unknown): error is YahooMaintenanceError {
  return error instanceof YahooMaintenanceError;
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

function isRateLimitStatusCode(status: number): boolean {
  return RATE_LIMIT_STATUS_CODES.includes(status);
}

function isAuthErrorStatusCode(status: number): boolean {
  return AUTH_ERROR_STATUS_CODES.includes(status);
}

function parseRetryAfterHeader(response: Response): number | undefined {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const parsed = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function isYahooMaintenanceResponse(errorData: string): boolean {
  return errorData.includes(YAHOO_MAINTENANCE_INDICATOR);
}

/**
 * Handle error responses from Yahoo API.
 * Throws appropriate error types based on status code.
 */
function handleErrorResponse(response: Response, errorData: string, uid?: string): never {
  if (isYahooMaintenanceResponse(errorData)) {
    structuredLogger.warn("Yahoo API in maintenance/read-only mode", {
      phase: "yahoo-http",
      service: "yahoo",
      event: "YAHOO_MAINTENANCE_MODE",
      userId: uid,
      statusCode: response.status,
      url: response.url,
      retryAfterSeconds: YAHOO_MAINTENANCE_RETRY_AFTER_SECONDS,
      outcome: "unhandled-error",
    });

    throw new YahooMaintenanceError(
      `Yahoo API is in read-only/maintenance mode (HTTP ${response.status})`,
      YAHOO_MAINTENANCE_RETRY_AFTER_SECONDS,
    );
  }

  if (isRateLimitStatusCode(response.status)) {
    const retryAfter = parseRetryAfterHeader(response);

    structuredLogger.warn("Yahoo API rate limit detected", {
      phase: "yahoo-http",
      service: "yahoo",
      event: "YAHOO_RATE_LIMIT",
      userId: uid,
      statusCode: response.status,
      retryAfterHeader: response.headers.get("Retry-After"),
      retryAfter,
      url: response.url,
      outcome: "unhandled-error",
    });

    throw new ApiRateLimitError(
      `Yahoo API rate limit exceeded (HTTP ${response.status})`,
      response.status,
      retryAfter,
    );
  }

  if (isAuthErrorStatusCode(response.status)) {
    structuredLogger.warn("Yahoo API auth error detected", {
      phase: "yahoo-http",
      service: "yahoo",
      event: "YAHOO_AUTH_ERROR",
      userId: uid,
      statusCode: response.status,
      url: response.url,
      outcome: "unhandled-error",
    });

    throw new AuthorizationError(
      `Yahoo API authentication failed (HTTP ${response.status})`,
      response.status,
      uid,
    );
  }

  structuredLogger.error("Yahoo API HTTP error", {
    phase: "yahoo-http",
    service: "yahoo",
    event: "YAHOO_HTTP_ERROR",
    userId: uid,
    statusCode: response.status,
    url: response.url,
    responsePreview: errorData.substring(0, 500),
    outcome: "unhandled-error",
  });

  throw new HttpError(`HTTP ${response.status}: ${response.statusText}`, {
    data: errorData,
    status: response.status,
  });
}

/**
 * Handle fetch response - checks for errors and optionally parses JSON body.
 *
 * @param response - The fetch Response
 * @param uid - Optional user ID for logging
 * @param parseJson - Whether to parse response body as JSON (default: true)
 */
async function handleFetchResponse<T>(response: Response, uid?: string): Promise<HttpResponse<T>> {
  if (!response.ok) {
    const errorData = await response.text();
    handleErrorResponse(response, errorData, uid);
  }

  try {
    const data = (await response.json()) as T;
    return { data, status: response.status };
  } catch {
    const responseText = await response
      .clone()
      .text()
      .catch(() => "[unable to read response body]");

    structuredLogger.error("Yahoo API returned non-JSON response", {
      phase: "yahoo-http",
      service: "yahoo",
      event: "YAHOO_JSON_PARSE_ERROR",
      userId: uid,
      statusCode: response.status,
      url: response.url,
      contentType: response.headers.get("Content-Type"),
      responsePreview: responseText.substring(0, 500),
      outcome: "unhandled-error",
    });

    throw new HttpError(`Yahoo API returned invalid JSON (HTTP ${response.status})`, {
      data: responseText,
      status: response.status,
    });
  }
}

/**
 * Perform an HTTP get request to the yahoo API
 *
 * @export
 * @async
 * @param url - the url to fetch
 * @param uid - the firebase uid of the user
 * @return - the response from the API
 */
export async function httpGetYahoo<T>(url: string, uid?: string): Promise<HttpResponse<T>> {
  if (!uid) {
    const response = await fetch(API_URL + url);
    return handleFetchResponse<T>(response);
  }

  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  const response = await fetch(API_URL + url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return handleFetchResponse<T>(response, uid);
}

/**
 * Perform an HTTP post request to the Yahoo API (unauthenticated).
 *
 * @export
 * @async
 * @param url - the FULL url to post to. Does not use API_URL.
 * @param body - the body of the post request
 * @return - the response from the API
 */
export async function httpPostYahooUnauth<T>(url: string, body: string): Promise<HttpResponse<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return handleFetchResponse<T>(response);
}

/**
 * Perform an HTTP post request to the Yahoo API with authentication.
 * Expects JSON response.
 */
export async function httpPostYahooAuth<T>(
  uid: string,
  url: string,
  body: string,
): Promise<HttpResponse<T>> {
  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  const response = await fetch(API_URL + url, {
    method: "POST",
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });
  return handleFetchResponse<T>(response, uid);
}

/**
 * POST to Yahoo API with XML body, not expecting to parse response.
 * Yahoo transaction endpoints return 201 Created with XML body that we don't need.
 */
export async function httpPostYahooAuthXml(uid: string, url: string, body: string): Promise<void> {
  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  const response = await fetch(API_URL + url, {
    method: "POST",
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  if (!response.ok) {
    const errorData = await response.text();
    handleErrorResponse(response, errorData, uid);
  }
}

/**
 * Perform an HTTP put request to the yahoo API
 *
 * @export
 * @async
 * @param uid The firebase uid of the user
 * @param url - the url to fetch
 * @param body - the body of the put request
 * @return - the response from the API
 */
export async function httpPutYahoo<T>(
  uid: string,
  url: string,
  body: string,
): Promise<HttpResponse<T>> {
  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  const response = await fetch(API_URL + url, {
    method: "PUT",
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });
  return handleFetchResponse<T>(response, uid);
}
