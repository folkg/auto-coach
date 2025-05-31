import { type } from "arktype";

const GameDetailsSchema = "Record<string, unknown>";

// Player Schemas
const BasePlayerDetailsSchema = "Record<string, unknown>[]";
const RequestedPlayerDetailsSchema = "Record<string, unknown>[]";

const YahooPlayerTuple = type({
  player: [BasePlayerDetailsSchema, "...", RequestedPlayerDetailsSchema],
});

export const YahooAPIPlayersSchema = type({
  players: type({
    "[string]": YahooPlayerTuple.or("number"), // the key is an index, ie. "0". Also has a "count" property that is a number.
  }),
});

export type YahooAPIPlayers = typeof YahooAPIPlayersSchema.infer;

export const YahooAPIPlayerResponseSchema = type({
  fantasy_content: {
    games: {
      "0": {
        game: [GameDetailsSchema, YahooAPIPlayersSchema],
      },
      count: "number",
    },
  },
});

export type YahooAPIPlayerResponse = typeof YahooAPIPlayerResponseSchema.infer;

// League Schemas
const YahooLeagueInfoSchema = type({
  league_key: "string",
});

export const YahooAPILeagueResponseSchema = type({
  fantasy_content: {
    league: [YahooLeagueInfoSchema, YahooAPIPlayersSchema],
  },
});

export type YahooAPILeagueResponse = typeof YahooAPILeagueResponseSchema.infer;

// User / Game Schemas
const LeagueInfoSchema = "Record<string, unknown>";
const RequestedLeagueInfoSchema = "Record<string, unknown>[]";

const LeagueDetails = type({
  "[string]": type({
    // the key is an index, ie. "0"
    league: [LeagueInfoSchema, "...", RequestedLeagueInfoSchema],
  }).or("number"), // TODO: Better way to handle the count: "number" in each union? count always reduces to string.
});
export type LeagueDetails = typeof LeagueDetails.infer;

const LeagueDetailsSchema = type({
  leagues: LeagueDetails,
});

export const YahooAPIUserResponseSchema = type({
  fantasy_content: {
    users: {
      "0": {
        user: [
          { guid: "string" },
          {
            games: {
              "[string]": type({
                game: [GameDetailsSchema, LeagueDetailsSchema],
              }).or("number"), // TODO: Better way to handle the count: "number" in each union? count always reduces to string.
            },
          },
        ],
      },
      count: "number",
    },
  },
});

export type YahooAPIUserResponse = typeof YahooAPIUserResponseSchema.infer;
