import axios, { type AxiosError } from "axios";
import axiosRetry, { isNetworkError, isRetryableError } from "axios-retry";
import { loadYahooAccessToken } from "../firebase/firestore.service.js";

const API_URL = "https://fantasysports.yahooapis.com/fantasy/v2/";
const shouldRetry = (error: AxiosError) =>
  isNetworkError(error) ||
  isRetryableError(error) ||
  error.code === "ECONNABORTED" ||
  error.response?.status === 429;
axiosRetry(axios, {
  retries: 3,
  retryCondition: shouldRetry,
});

/**
 * Perform an HTTP put request to the yahoo API
 *
 * @export
 * @async
 * @param {string} url - the url to fetch
 * @param {?string} [uid] - the firebase uid of the user
 * @return {unknown} - the response from the API
 */
export async function httpGetAxios<T>(url: string, uid?: string) {
  if (!uid) {
    return axios.get<T>(API_URL + url);
  }

  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  return axios.get(API_URL + url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * Perform an HTTP post request to the Yahoo API
 *
 * @export
 * @async
 * @param {string} url - the FULL url to post to. Does not use API_URL.
 * @param {*} body - the body of the post request
 * @return {unknown} - the response from the API
 */
export function httpPostAxiosUnauth<T>(url: string, body: unknown) {
  return axios.post<T>(url, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

export async function httpPostAxiosAuth<T>(
  uid: string,
  url: string,
  body: unknown,
) {
  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  return axios.post<T>(API_URL + url, body, {
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * Perform an HTTP put request to the yahoo API
 *
 * @export
 * @async
 * @param {string} uid The firebase uid of the user
 * @param {string} url - the url to fetch
 * @param {string} body - the body of the put request
 * @return {unknown} - the response from the API
 */
export async function httpPutAxios<T>(uid: string, url: string, body: string) {
  const credential = await loadYahooAccessToken(uid);
  const accessToken = credential.accessToken;

  return axios.put<T>(API_URL + url, body, {
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
