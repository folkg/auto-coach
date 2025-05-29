import { type } from "arktype";

export const Leagues = type("'mlb'|'nba'|'nfl'|'nhl'");
export type Leagues = typeof Leagues.infer;
