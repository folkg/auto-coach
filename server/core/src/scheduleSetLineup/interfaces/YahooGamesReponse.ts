import { type } from "arktype";

/**
 * Schema for the new Yahoo Graphite leagueGameIdsByDate endpoint.
 * GET https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate
 */
const YahooGraphiteGameSchema = type({
  gameId: "string",
  startTime: "string",
  status: "string",
});

const YahooGraphiteLeagueSchema = type({
  games: YahooGraphiteGameSchema.array(),
});

export const YahooLeagueGameIdsByDateResponseSchema = type({
  data: {
    leagues: YahooGraphiteLeagueSchema.array(),
  },
});

export type YahooLeagueGameIdsByDateResponse = typeof YahooLeagueGameIdsByDateResponseSchema.infer;

/**
 * Schema for the new Yahoo Graphite scoreboardGame endpoint.
 * GET https://graphite.sports.yahoo.com/v1/query/shangrila/scoreboardGame
 */
const YahooScoreboardGameSchema = type({
  awayTeamId: "string",
  homeTeamId: "string",
  startTime: "string",
  gameStatus: "string",
});

export const YahooScoreboardGameResponseSchema = type({
  data: {
    games: YahooScoreboardGameSchema.array(),
  },
});

export type YahooScoreboardGameResponse = typeof YahooScoreboardGameResponseSchema.infer;

/**
 * @deprecated Use YahooLeagueGameIdsByDateResponseSchema instead.
 * Legacy schema for the old Yahoo API endpoint (api-secure.sports.yahoo.com).
 */
const YahooGameStatusSchema = type({
  type: "string", // "status.type.postponed"
  description: "string", // "Postponed"
  display_name: "string", // "Ppd"
});

const YahooTeamIdSchema = type({
  "away_team_id?": "string",
  "home_team_id?": "string",
  "global_away_team_id?": "string",
  "global_home_team_id?": "string",
});

const YahooGameSchema = type({
  game: {
    game_status: YahooGameStatusSchema,
    start_time: "string", // Date as a string, eg. "Wed, 20 Mar 2024 10:05:00 +0000"
    team_ids: YahooTeamIdSchema.array(),
  },
});

export const YahooGamesResponseSchema = type({
  league: {
    games: {
      "0": YahooGameSchema.array(),
    },
  },
});

export type YahooGamesReponse = typeof YahooGamesResponseSchema.infer;
