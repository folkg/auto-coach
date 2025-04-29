import { type } from "arktype";

export const Schedule = type({
  date: "string",
  games: type({ "['mlb'|'nba'|'nfl'|'nhl']": "number[]" }), // TODO: How to re-use Leagues here?
  // games: type.Record(Leagues, "number[]"), // Doesn't work
});

export type Schedule = typeof Schedule.infer;
