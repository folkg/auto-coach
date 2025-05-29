import { type } from "arktype";

export const Schedule = type({
  date: "string",
  games: type({ "['mlb'|'nba'|'nfl'|'nhl']": "number[]" }),
});
export type Schedule = typeof Schedule.infer;
