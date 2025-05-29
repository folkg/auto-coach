import { assertType } from "@common/utilities/checks.js";
import { type } from "arktype";
import { GoogleAuth } from "google-auth-library";
import spacetime from "spacetime";

/**
 * The properties of the Player object are not consistent.
 * This function will find the property by name.
 *
 * @param {Record<string, unknown>[]} array - The array to search
 * @param {string} key - The property name to search for
 * @return {unknown} - The value of the property
 */
export function getChild(
  array: Record<string, unknown>[],
  key: string,
): unknown {
  const element = array.find((o) => o[key] !== undefined);
  return element ? element[key] : null;
}

export function flattenArray(
  arr: Record<string, unknown>[],
): Record<string, unknown> {
  return arr.reduce<Record<string, unknown>>((acc, item) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      for (const [key, value] of Object.entries(item)) {
        acc[key] = value;
      }
    }
    return acc;
  }, {});
}

export function parseToInt(
  value: string | number | undefined,
  defaultValue = -1,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value) ?? defaultValue;
}

const GoogleAuthResponse = type({
  data: {
    serviceConfig: {
      uri: "string",
    },
  },
});

let auth: GoogleAuth;
/**
 * Get the URL of a given v2 cloud function.
 *
 * @param {string} name the function's name
 * @param {string} location the function's location
 * @return {Promise<string>} The URL of the function
 *
 */
export async function getFunctionUrl(
  name: string,
  location = "us-central1",
): Promise<string> {
  if (!auth) {
    auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
  }
  const projectId = await auth.getProjectId();
  const url = `https://cloudfunctions.googleapis.com/v2beta/projects/${projectId}/locations/${location}/functions/${name}`;

  const client = await auth.getClient();
  const res = await client.request({ url });
  assertType(res, GoogleAuthResponse);
  return res.data.serviceConfig.uri;
}

/**
 * convert date (PT) to a string in the format YYYY-MM-DD
 *
 * @param {Date} date - The date to convert
 * @return {string} - The date, pacific time, in the format YYYY-MM-DD
 */
export function getPacificTimeDateString(date: Date): string {
  const t = spacetime(date, "Canada/Pacific");
  const year = String(t.year());
  const month = String(t.month() + 1).padStart(2, "0");
  const day = String(t.date()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayPacific(): string {
  return getPacificTimeDateString(new Date());
}

/**
 * get the start of the day in pacific time (00:00:00.000)
 *
 * @export
 * @param {string} date - The date string to convert
 * @return {number} - The start of the day in pacific time
 */
export function getPacificStartOfDay(date: string): number {
  return spacetime(date, "Canada/Pacific").startOf("day").epoch;
}

/**
 * get the end of the day in pacific time (23:59:59.999)
 *
 * @export
 * @param {string} date - The date string to convert
 * @return {number} - The end of the day in pacific time
 */
export function getPacificEndOfDay(date: string): number {
  return spacetime(date, "Canada/Pacific").endOf("day").epoch;
}

/**
 * get the current hour in pacific time
 *
 * @export
 * @return {number} - The current hour in pacific time
 */
export function getCurrentPacificHour(): number {
  return spacetime.now("Canada/Pacific").hour();
}

/**
 * 	Return the current day of the week (Pacific Time) as an integer, starting on sunday (day-0)
 *
 * @export
 * @return {number} - The current day of the week (Pacific Time) as an integer, starting on sunday (day-0)
 */
export function getCurrentPacificNumDay(): number {
  return spacetime.now("Canada/Pacific").day();
}

export function isTodayPacific(timestamp: number | undefined): boolean {
  if (timestamp === undefined || timestamp === -1) {
    return false;
  }
  const now = spacetime.now("Canada/Pacific");
  const date = spacetime(timestamp, "Canada/Pacific");
  return now.isSame(date, "day");
}

/**
 * Return now() as an epoch number.
 *
 * Useful for mocking the current time in tests, if we ever need to.
 *
 * @export
 * @return {number}
 */
export function getNow(): number {
  return spacetime.now().epoch;
}

/**
 * return the current progress through the week as a number between 0 and 1
 *
 * @export
 * @return {number} - The current progress through the week as a number between 0 and 1
 */
export function getWeeklyProgressPacific(): number {
  return spacetime.now("Canada/Pacific").progress().week;
}

/**
 * return the current progress between two dates as a number between 0 and 1
 *
 * @export
 * @param {number} startDate - The start date in epoch format
 * @param {number} endDate - The end date in epoch format
 * @return {number} - The current progress between two dates as a number between 0 and 1
 */
export function getProgressBetween(startDate: number, endDate: number): number {
  return (getNow() - startDate) / (endDate - startDate);
}

/**
 * Takes an array and a predicate function and returns an array of two arrays.
 * The first array contains all the elements that satisfy the predicate.
 * The second array contains all the elements that do not satisfy the predicate.
 *
 * @template T The type of the array elements
 * @param {T[]} arr The array to partition
 * @param {()} predicate The predicate function
 * @return {[][]} The partitioned array
 */
export function partitionArray<T>(
  arr: T[],
  predicate: (item: T) => boolean,
): T[][] {
  return arr.reduce(
    (acc, item) => {
      if (predicate(item)) {
        acc[0].push(item);
      } else {
        acc[1].push(item);
      }
      return acc;
    },
    [[], []] as T[][],
  );
}

/**
 * Returns true if the array is empty or all of the sub arrays are empty.
 *
 * @export
 * @template T The type of the array elements
 * @param {T} arr The array to check
 * @return {boolean} True if the array is empty or all of the sub arrays are empty
 */
export function is2DArrayEmpty<T>(arr: T[][]): boolean {
  return arr.length === 0 || arr.every((subArr) => subArr.length === 0);
}
