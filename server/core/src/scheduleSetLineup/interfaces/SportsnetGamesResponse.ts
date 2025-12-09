import { type } from "arktype";

const SportsnetTeamSchema = type({
  id: "number",
  name: "string",
  short_name: "string",
  city: "string",
});

const SportsnetGameSchema = type({
  details: {
    timestamp: "number",
    status: "string",
  },
  visiting_team: SportsnetTeamSchema,
  home_team: SportsnetTeamSchema,
});

export const SportsnetGamesResponseSchema = type({
  data: {
    "0": {
      games: SportsnetGameSchema.array(),
    },
  },
});

export type SportsnetGamesResponse = typeof SportsnetGamesResponseSchema.infer;
