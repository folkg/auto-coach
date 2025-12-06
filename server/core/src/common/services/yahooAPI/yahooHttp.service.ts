import { ApiRateLimitError, AuthorizationError } from "@common/utilities/error.js";
import { logger } from "firebase-functions";

import { loadYahooAccessToken } from "../firebase/firestore.service.js";

const API_URL = "https://fantasysports.yahooapis.com/fantasy/v2/";

/** Rate limit status codes from Yahoo API */
const RATE_LIMIT_STATUS_CODES = [429, 999];

/** Auth error status codes from Yahoo API */
const AUTH_ERROR_STATUS_CODES = [401, 403];

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
 * Type guard for HttpError
 */
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

async function handleFetchResponse<T>(response: Response): Promise<HttpResponse<T>> {
  if (!response.ok) {
    const errorData = await response.text();

    if (isRateLimitStatusCode(response.status)) {
      const retryAfter = parseRetryAfterHeader(response);

      logger.warn("Yahoo API rate limit detected", {
        statusCode: response.status,
        retryAfterHeader: response.headers.get("Retry-After"),
        retryAfterParsed: retryAfter,
        url: response.url,
      });

      throw new ApiRateLimitError(
        `Yahoo API rate limit exceeded (HTTP ${response.status})`,
        response.status,
        retryAfter,
      );
    }

    if (isAuthErrorStatusCode(response.status)) {
      logger.warn("Yahoo API auth error detected", {
        statusCode: response.status,
        url: response.url,
      });

      throw new AuthorizationError(
        `Yahoo API authentication failed (HTTP ${response.status})`,
        response.status,
      );
    }

    throw new HttpError(`HTTP ${response.status}: ${response.statusText}`, {
      data: errorData,
      status: response.status,
    });
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

/**
 * Perform an HTTP get request to the yahoo API
 *
 * @export
 * @async
 * @param {string} url - the url to fetch
 * @param {?string} [uid] - the firebase uid of the user
 * @return {Promise<HttpResponse<T>>} - the response from the API
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
  return handleFetchResponse<T>(response);
}

/**
 * Perform an HTTP post request to the Yahoo API
 *
 * @export
 * @async
 * @param {string} url - the FULL url to post to. Does not use API_URL.
 * @param {*} body - the body of the post request
 * @return {Promise<HttpResponse<T>>} - the response from the API
 */
export async function httpPostYahooUnauth<T>(url: string, body: unknown): Promise<HttpResponse<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body as string,
  });
  return handleFetchResponse<T>(response);
}

export async function httpPostYahooAuth<T>(
  uid: string,
  url: string,
  body: unknown,
): Promise<HttpResponse<T>> {
  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  const response = await fetch(API_URL + url, {
    method: "POST",
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
    body: body as string,
  });
  return handleFetchResponse<T>(response);
}

/**
 * Perform an HTTP put request to the yahoo API
 *
 * @export
 * @async
 * @param {string} uid The firebase uid of the user
 * @param {string} url - the url to fetch
 * @param {string} body - the body of the put request
 * @return {Promise<HttpResponse<T>>} - the response from the API
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
  return handleFetchResponse<T>(response);
}
