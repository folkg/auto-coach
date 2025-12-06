import type {
  LineupChanges,
  PlayerTransaction,
  TPlayer,
  TransactionType,
} from "@common/types/transactions.js";

import { assertType, ensureType } from "@common/utilities/checks.js";
import dotenv from "dotenv";
import { XMLParser } from "fast-xml-parser";
import { logger } from "firebase-functions";
import js2xmlparser from "js2xmlparser";

import type { Token, YahooRefreshRequestBody } from "../../interfaces/credential.js";
import type { YahooAccessTokenResponse } from "./interfaces/YahooAccessTokenResponse.js";

import { RevokedRefreshTokenError } from "../firebase/errors.js";
import { updateFirestoreTimestamp } from "../firebase/firestore.service.js";
import {
  type YahooAPILeagueResponse,
  YahooAPILeagueResponseSchema,
  type YahooAPIPlayerResponse,
  YahooAPIPlayerResponseSchema,
  type YahooAPIUserResponse,
  YahooAPIUserResponseSchema,
} from "./interfaces/YahooAPIResponse.js";
import {
  type HttpError,
  httpGetYahoo,
  httpPostYahooAuth,
  httpPostYahooUnauth,
  httpPutYahoo,
  isHttpError,
  isYahooRateLimitError,
} from "./yahooHttp.service.js";

dotenv.config();

export type AvailabilityStatus = "A" | "FA" | "W";
export type PlayerSort =
  | "sort=R_PO"
  | "sort=AR_L30;sort_type=lastmonth"
  | "sort=AR_L14;sort_type=biweekly"
  | "sort=AR_L4W;sort_type=last4weeks";
// Required for URL replacement when specifying combo positions
const POSITION_EXPANSION: Record<string, string> = {
  "W/T": "WR, TE",
  "W/R": "WR, RB",
  "W/R/T": "WR,RB,TE",
  "Q/W/R/T": "QB, WR, RB, TE",
};

/**
 * Refresh the Yahoo access token for the given user
 * @param {string} refreshToken The refresh token
 * @return {Promise<Token>} The new credential
 */
export async function refreshYahooAccessToken(refreshToken: string): Promise<Token> {
  const url = "https://api.login.yahoo.com/oauth2/get_token";
  // TODO: Don't type-cast process.env variables
  const requestBody: YahooRefreshRequestBody = {
    client_id: process.env.YAHOO_CLIENT_ID as string,
    client_secret: process.env.YAHOO_CLIENT_SECRET as string,
    redirect_uri: process.env.YAHOO_REDIRECT_URI as string,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };
  const body = Object.keys(requestBody)
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(requestBody[key as keyof YahooRefreshRequestBody])}`,
    )
    .join("&");

  try {
    const requestTime = Date.now();
    const { data } = await httpPostYahooUnauth<YahooAccessTokenResponse>(url, body);
    // Get the token info from the response and save it to the database
    const accessToken = data.access_token;
    const tokenExpirationTime = data.expires_in * 1000 + requestTime;
    const token: Token = {
      accessToken: accessToken,
      refreshToken: data.refresh_token,
      tokenExpirationTime: tokenExpirationTime,
    };

    return token;
  } catch (err: unknown) {
    handleHttpError(err, null);
  }
}

/**
 * Will get the JSON response from Yahoo for all teams matching the TeamIDs
 * This will be useful if we want to get for just individual teams
 *
 * @async
 * @param {string} teamKeys - comma separated string of teamIDs, ie.
 * "414.l.240994.t.12, 414.l.358976.t.4, 419.l.14950.t.2,
 * 419.l.19947.t.6,419.l.28340.t.1,419.l.59985.t.12"
 * @param {string} uid - The firebase uid
 * @param {string} [date=""] - The date to get the roster for in the format 2023-01-27. Defaults to today.
 * @return {Promise<any>} The Yahoo JSON object containing the rosters
 */
export async function getRostersByTeamID(
  teamKeys: string[],
  uid: string,
  date = "",
): Promise<YahooAPIUserResponse> {
  const leagueKeysArray: string[] = [];
  for (const teamKey of teamKeys) {
    const leagueKey = teamKey.split(".t")[0];
    if (leagueKey) {
      leagueKeysArray.push(leagueKey);
    }
  }
  const leagueKeys = leagueKeysArray.join(",");

  const url = `users;use_login=1/games;game_keys=nhl,nfl,nba,mlb/leagues;league_keys=${leagueKeys};out=settings/teams;out=transactions,games_played;transactions.types=waiver,pending_trade/roster;date=${date}/players;out=percent_started,percent_owned,ranks,opponent,starting_status;ranks=last30days,last14days,projected_next7days,projected_season_remaining,last4weeks,projected_week,projected_next4weeks;percent_started.cut_types=diamond;percent_owned.cut_types=diamond?format=json`;

  try {
    const { data } = await httpGetYahoo(url, uid);
    assertType(data, YahooAPIUserResponseSchema);
    return data;
  } catch (err) {
    const errMessage = `Error in getRostersByTeamID. User: ${uid} Teams: ${teamKeys}`;
    handleHttpError(err, errMessage);
  }
}

/**
 * Will fetch the top 25 free agents for the given league, based on rank over
 * the last 14 days
 *
 * @export
 * @async
 * @param {string} teamKeys - The league key
 * @param {string} uid - The Yahoo user ID
 * @param {AvailabilityStatus} [availabilityStatus="A"] - The availability status
 * @param {PlayerSort} [sort="sort=R_PO"] - The sort order
 * @return {Promise<any>}
 */
export async function getTopAvailablePlayers(
  teamKeys: string[],
  uid: string,
  availabilityStatus: AvailabilityStatus = "A", // A = All Available, FA = Free Agents Only, W = Waivers Only
  sort: PlayerSort = "sort=R_PO",
): Promise<YahooAPIUserResponse> {
  const leagueKeysArray: string[] = [];
  for (const teamKey of teamKeys) {
    const leagueKey = teamKey.split(".t")[0];
    if (leagueKey) {
      leagueKeysArray.push(leagueKey);
    }
  }

  const leagueKeys = leagueKeysArray.join(",");
  const url = `users;use_login=1/games;game_keys=nhl,nfl,nba,mlb/leagues;league_keys=${leagueKeys}/players;status=${availabilityStatus};${sort};out=ownership,percent_started,percent_owned,ranks,opponent,starting_status;ranks=last30days,last14days,projected_next7days,projected_season_remaining,last4weeks,projected_week,projected_next4weeks;percent_started.cut_types=diamond;percent_owned.cut_types=diamond?format=json`;

  try {
    const { data } = await httpGetYahoo(url, uid);
    assertType(data, YahooAPIUserResponseSchema);
    return data;
  } catch (err) {
    const errMessage = `Error in getTopAvailablePlayers. User: ${uid} League: ${teamKeys}`;
    handleHttpError(err, errMessage);
  }
}

export async function getTopPlayersGeneral(
  uid: string,
  gameKey: string,
  position: string,
  start = 0,
  availabilityStatus: AvailabilityStatus = "A", // A = All Available, FA = Free Agents Only, W = Waivers Only
  sort: PlayerSort = "sort=R_PO",
): Promise<YahooAPIPlayerResponse> {
  const positionArray = position.split(",");
  const expandedPositions = positionArray.map((pos) => POSITION_EXPANSION[pos] ?? pos);
  const positions = expandedPositions.join(",");

  const url = `/games;game_keys=${gameKey}/players;status=${availabilityStatus};position=${positions};${sort};count=25;start=${start};out=ownership,percent_started,percent_owned,ranks,opponent,starting_status;ranks=last30days,last14days,projected_next7days,projected_season_remaining,last4weeks,projected_week,projected_next4weeks;percent_started.cut_types=diamond;percent_owned.cut_types=diamond?format=json`;

  try {
    const { data } = await httpGetYahoo(url, uid);
    assertType(data, YahooAPIPlayerResponseSchema);
    return data;
  } catch (err) {
    const errMessage = "Error in getTopPlayersGeneral.";
    handleHttpError(err, errMessage);
  }
}

/**
 * Get the standings for a specific user's team in a league
 *
 * @export
 * @async
 * @param {string} uid - The firebase uid
 * @return {Promise<any>} The Yahoo JSON object containing team's standings data and settings
 */
export async function getUsersTeams(uid: string): Promise<YahooAPIUserResponse> {
  try {
    const { data } = await httpGetYahoo(
      "users;use_login=1/games;game_keys=nfl,nhl,nba,mlb/leagues;out=settings/teams;out=standings?format=json",
      uid,
    );
    assertType(data, YahooAPIUserResponseSchema);
    return data;
  } catch (err) {
    const errMessage = `Error in getUserStandings. User: ${uid}`;
    handleHttpError(err, errMessage);
  }
}

/**
 * Get the projected/confirmed starting players for the league
 * ie. goalies from NHL, pitchers from MLB
 *
 * @export
 * @async
 * @param {string} league - The league, ie. nhl, mlb
 * @param {string} uid - The firebase uid
 * @param {string} leagueKey - The user's Yahoo league key (ie. nhl.l.123)
 * @return {Promise<any>} The Yahoo JSON object containing raw start data
 */
export async function getStartingPlayers(
  league: string,
  uid: string,
  leagueKey: string,
): Promise<YahooAPILeagueResponse[]> {
  const starterPositions: { [key: string]: string } = {
    nhl: "S_G",
    mlb: "S_P",
  };
  const positions = starterPositions[league];
  if (!positions) {
    return [];
  }

  try {
    // There could be up to 32 starting players, so we need to make 2 calls
    // to get all the players. The first call will get the first 25 players.
    const urlBase = `league/${leagueKey}/players;position=${positions};sort=AR;start=`;
    const results = await Promise.all([
      httpGetYahoo(`${urlBase}0?format=json`, uid),
      httpGetYahoo(`${urlBase}25?format=json`, uid),
    ]);
    return results.map((result) => ensureType(result.data, YahooAPILeagueResponseSchema));
  } catch (err) {
    const errMessage = `Error in getStartingPlayers. User: ${uid} League: ${leagueKey} Position: ${positions}`;
    handleHttpError(err, errMessage);
  }
}

/**
 * Post the roster changes to Yahoo sequentially, continuing on errors
 * EXCEPT for rate limit errors which are immediately re-thrown
 *
 * @export
 * @async
 * @param {LineupChanges[]} lineupChanges
 * @param {string} uid The firebase uid of the user
 */
export async function putLineupChanges(lineupChanges: LineupChanges[], uid: string): Promise<void> {
  const errors: Error[] = [];

  for (const lineupChange of lineupChanges) {
    const { newPlayerPositions, teamKey } = lineupChange;

    const players = [];
    for (const [playerKey, position] of Object.entries(newPlayerPositions)) {
      players.push({ player_key: playerKey, position });
    }

    const { coverageType, coveragePeriod } = lineupChange;
    const data = {
      roster: {
        coverage_type: coverageType,
        [coverageType]: coveragePeriod,
        players: { player: players },
      },
    };

    const XML_NAMESPACE = "fantasy_content";
    const xmlBody = js2xmlparser.parse(XML_NAMESPACE, data);

    try {
      await putRosterChangePromise(uid, teamKey, xmlBody);
    } catch (err) {
      if (isYahooRateLimitError(err)) {
        throw err;
      }
      logger.error(JSON.stringify(err));
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (errors.length > 0) {
    throw new Error(`Error in putLineupChanges. User: ${uid}. ${errors.length} change(s) failed.`);
  }
}

async function putRosterChangePromise(uid: string, teamKey: string, xmlBody: string) {
  await httpPutYahoo(uid, `team/${teamKey}/roster?format=json`, xmlBody);
  logger.log(`Successfully put roster changes for team: ${teamKey} for user: ${uid}`);
  await updateFirestoreTimestamp(uid, teamKey);
}

/**
 * Post the roster add/drop transactions to Yahoo
 *
 * @export
 * @async
 * @param {PlayerTransaction} transaction The transaction object to post
 * @param {string} uid The Yahoo uid of the user
 * @return {Promise<PlayerTransaction | null>} The transaction object that was successfully posted
 */
export async function postRosterAddDropTransaction(
  transaction: PlayerTransaction,
  uid: string,
): Promise<PlayerTransaction | null> {
  const { teamKey, players } = transaction;

  const validPlayerCount = [1, 2].includes(players.length);
  if (!validPlayerCount) {
    logger.warn(
      `Transaction was not processed. Invalid number of players to move: ${players.length} for team: ${teamKey} for user: ${uid}. Must be 1 or 2.`,
    );
    return null;
  }
  const XMLPlayers: TransactionPlayer[] = players.map((player: TPlayer) => ({
    player_key: player.playerKey,
    transaction_data: {
      type: player.transactionType,
      [player.transactionType === "add" ? "destination_team_key" : "source_team_key"]: teamKey,
    },
  }));
  XMLPlayers.sort((a, b) => (a.transaction_data.type > b.transaction_data.type ? 1 : -1)); // sorts "add' before "drop" alphabetically, as required by Yahoo

  const firstPlayer = XMLPlayers[0];
  const transactionType: TransactionType =
    XMLPlayers.length === 1 && firstPlayer ? firstPlayer.transaction_data.type : "add/drop";

  const data: TransactionBody = {
    transaction: {
      type: transactionType,
    },
  };

  const isWaiverClaim =
    players.filter((player: TPlayer) => player.transactionType === "add" && player.isFromWaivers)
      .length === 1;
  if (isWaiverClaim && transaction.isFaabRequired) {
    data.transaction.faab_bid = 0;
  }

  if (XMLPlayers.length === 1) {
    data.transaction.player = XMLPlayers[0];
  } else {
    data.transaction.players = { player: XMLPlayers };
  }

  const XML_NAMESPACE = "fantasy_content";
  const xmlBody = js2xmlparser.parse(XML_NAMESPACE, data);

  const leagueKey = teamKey.split(".t")[0];
  try {
    await httpPostYahooAuth(uid, `league/${leagueKey}/transactions`, xmlBody);
    logger.log(
      `Successfully posted ${transactionType} transaction for team: ${teamKey} for user: ${uid}.`,
    );
    logger.log("Transaction data:", { data });
    return transaction;
  } catch (err: unknown) {
    if (isYahooRateLimitError(err)) {
      throw err;
    }

    const errMessage = `There was a problem posting one transaction. Here are the error details: User: ${uid} Team: ${teamKey} Transaction: ${JSON.stringify(
      transaction,
    )}`;
    let throwError = true;
    if (isHttpError(err)) {
      throwError = checkYahooErrorDescription(err, errMessage);
    }
    if (throwError) {
      handleHttpError(err, errMessage);
    }
  }
  return null;
}

type TransactionBody = {
  transaction: Transaction;
};

type Transaction = {
  type: TransactionType;
  faab_bid?: number;
  player?: TransactionPlayer;
  players?: { player: TransactionPlayer[] };
};

type TransactionPlayer = {
  player_key: string;
  transaction_data: TransactionData;
};

type TransactionData = {
  type: TransactionType;
  destination_team_key?: string;
  source_team_key?: string;
};

// TODO: Handle from Yahoo data.error.description = 'Invalid cookie, please log in again.' status = 401
// It seems we don't need to revoke the token. What do we need to do? retry? Refetch access token?
// See team 422.l.54890.t.13 for example. Error @ 2023-04-16 13:55:12.916 MDT

/**
 * Handle HTTP errors
 *
 * @param {unknown} err - The error
 * @param {string} message - The message to throw
 */
function handleHttpError(err: unknown, message: string | null): never {
  const errMessage = message ? `${message}. ` : "";

  if (isYahooRateLimitError(err)) {
    throw err;
  }

  if (err instanceof RevokedRefreshTokenError) {
    throw err;
  }
  if (isHttpError(err) && err.response) {
    logger.error(errMessage, JSON.stringify(err), JSON.stringify(err.response.data, null, 2));
    const enrichedError = new Error(`${errMessage}${err.message}`);
    throw enrichedError;
  }
  const error = err as Error;
  logger.error(errMessage, error.message);
  throw new Error(`${errMessage}${error.message}`);
}

/**
 * Check the Yahoo error description to see if it is a known error that we can handle
 *
 * @param {HttpError} err - The HTTP error
 * @param {string} errMsg - The message to log
 * @return {boolean} - True if we should throw the error, false if we should not
 */
function checkYahooErrorDescription(err: HttpError, errMsg: string): boolean {
  let result = true;
  const xmlString: string = err.response?.data as string;
  const parser = new XMLParser();
  const parsedXml = parser.parse(xmlString);
  if (parsedXml) {
    const errorDescription: string = parsedXml.error.description;
    if (errorDescription === "You cannot add a player you dropped until the waiver period ends.") {
      console.info(`You cannot add a player you dropped until the waiver period ends. ${errMsg}`);
      result = false;
    }
  }
  return result;
}
