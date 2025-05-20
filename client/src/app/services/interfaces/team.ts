import { type } from "arktype";
import { Leagues } from "../../shared/interfaces/Leagues";

export const TeamFirestore = type({
  uid: "string",
  team_key: "string",
  game_code: Leagues,
  start_date: "number",
  end_date: "number",
  weekly_deadline: "string|number",
  roster_positions: "Record<string,number>",
  num_teams: "number",
  allow_transactions: "boolean",
  allow_dropping: "boolean",
  allow_adding: "boolean",
  allow_add_drops: "boolean",
  allow_waiver_adds: "boolean",
  automated_transaction_processing: "boolean?",
  last_updated: "number",
  lineup_paused_at: "number = -1",
  is_subscribed: "boolean",
  is_setting_lineups: "boolean",
});

export const Team = TeamFirestore.and(
  type({
    edit_key: "string",
    faab_balance: "number",
    current_weekly_adds: "number",
    current_season_adds: "number",
    scoring_type: "string",
    team_name: "string",
    league_name: "string",
    max_weekly_adds: "number",
    max_season_adds: "number",
    waiver_rule: "string",
    max_games_played: "number",
    max_innings_pitched: "number",
    game_name: "string",
    game_season: "string",
    game_is_over: "boolean|number",
    team_url: "string",
    team_logo: "string",
    rank: "string|number",
    points_for: "string|number|null",
    points_against: "string|number|null",
    points_back: "string|number|null",
    outcome_totals: type({
      wins: "string|number",
      losses: "string|number",
      ties: "string|number",
      percentage: "string|number",
    }).or("null"),
  }),
);

export type TeamFirestore = typeof TeamFirestore.infer;
export type Team = typeof Team.infer;
