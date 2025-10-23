import { type } from "arktype";
import { Leagues } from "./Leagues.js";
import { PlayerSchema } from "./Player.js";
import { TransactionDetailsSchema } from "./transactions.js";

const CommonTeam = type({
  team_key: "string",
  game_code: Leagues,
  start_date: "number",
  end_date: "number",
  weekly_deadline: "string",
  roster_positions: "Record<string,number>",
  num_teams: "number",
});

const OptionsTeam = type({
  allow_transactions: "boolean",
  allow_dropping: "boolean",
  allow_adding: "boolean",
  allow_add_drops: "boolean",
  allow_waiver_adds: "boolean",
  automated_transaction_processing: "boolean?",
  last_updated: "number",
  lineup_paused_at: "number = -1",
});

const YahooTeam = CommonTeam.and(
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
  }),
);

export const FirestoreTeam = CommonTeam.and(OptionsTeam).and(
  type({
    uid: "string",
    is_subscribed: "boolean",
    is_setting_lineups: "boolean",
  }),
);

export const InfoTeam = YahooTeam.and(
  type({
    "uid?": "string",
    max_games_played: "number = -1",
    max_innings_pitched: "number = -1",
    game_name: "string",
    game_season: "string",
    game_is_over: "boolean",
    team_url: "string",
    team_logo: "string",
    rank: "string|number",
    "points_for?": "string|number",
    "points_against?": "string|number",
    "points_back?": "string|number",
    "outcome_totals?": type({
      wins: "string|number",
      losses: "string|number",
      ties: "string|number",
      percentage: "string|number",
    }).or("null"),
  }),
);

export const ClientTeam = InfoTeam.and(FirestoreTeam);

const GamesPlayed = type({
  position: "string",
  games_played: type({
    played: "number",
    max: "number",
    projected: "number",
  }),
});

const InningsPitched = type({
  pitched: "number",
  max: "number",
  projected: "number",
});

export const TeamOptimizer = YahooTeam.and(
  OptionsTeam.partial().and(
    type({
      players: PlayerSchema.array(),
      coverage_type: "string",
      coverage_period: "string",
      transactions: TransactionDetailsSchema.array(),
      "games_played?": GamesPlayed.array(),
      "innings_pitched?": InningsPitched,
    }),
  ),
);

export type CommonTeam = typeof CommonTeam.infer;
export type OptionsTeam = typeof OptionsTeam.infer;
export type YahooTeam = typeof YahooTeam.infer;
export type FirestoreTeam = typeof FirestoreTeam.infer;
export type InfoTeam = typeof InfoTeam.infer;
export type ClientTeam = typeof ClientTeam.infer;
export type GamesPlayed = typeof GamesPlayed.infer;
export type InningsPitched = typeof InningsPitched.infer;
export type TeamOptimizer = typeof TeamOptimizer.infer;

/**
 * Converts a TeamAngular to a TeamFirestore
 *
 * @export
 * @param {InfoTeam} team - The team to convert
 * @param {string} uid - The user id
 * @return {FirestoreTeam} - The converted team
 */
export function yahooToFirestore(team: InfoTeam, uid: string): FirestoreTeam {
  const commonTeam: CommonTeam = {
    team_key: team.team_key,
    game_code: team.game_code,
    start_date: team.start_date,
    end_date: team.end_date,
    weekly_deadline: team.weekly_deadline,
    roster_positions: team.roster_positions,
    num_teams: team.num_teams,
  };

  const optionsTeam: OptionsTeam = {
    allow_transactions: false,
    allow_dropping: false,
    allow_adding: false,
    allow_add_drops: false,
    allow_waiver_adds: false,
    automated_transaction_processing: false,
    last_updated: -1,
    lineup_paused_at: -1,
  };

  return {
    uid,
    is_subscribed: true,
    is_setting_lineups: false,
    ...commonTeam,
    ...optionsTeam,
  };
}
