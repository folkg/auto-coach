import { type } from "arktype";

export const SportLeagueSchema = type("'mlb'|'nba'|'nfl'|'nhl'");

export type SportLeague = typeof SportLeagueSchema.infer;
