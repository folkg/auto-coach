import { type } from "arktype";

/**
 * Schema for the new Sportsnet ticker API (https://stats-api.sportsnet.ca/ticker?league=)
 * The old mobile-statsv2 endpoint is deprecated.
 */
const SportsnetTickerTeamSchema = type({
  id: "string",
  name: "string",
  short_name: "string",
  city: "string",
});

const SportsnetTickerGameSchema = type({
  game_status: "string",
  timestamp: "number",
  visiting_team: SportsnetTickerTeamSchema,
  home_team: SportsnetTickerTeamSchema,
});

export const SportsnetGamesResponseSchema = type({
  status: "string",
  data: {
    games: SportsnetTickerGameSchema.array(),
  },
});

export type SportsnetGamesResponse = typeof SportsnetGamesResponseSchema.infer;
