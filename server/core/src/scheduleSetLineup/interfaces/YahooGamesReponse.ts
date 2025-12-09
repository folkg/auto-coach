import { type } from "arktype";

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
