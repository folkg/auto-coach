import { type } from "arktype";

// Leagues
export const Leagues = type("'mlb'|'nba'|'nfl'|'nhl'");

// PlayerRanks
export const PlayerRanks = type({
  last30Days: "number",
  last14Days: "number",
  next7Days: "number",
  restOfSeason: "number",
  last4Weeks: "number",
  projectedWeek: "number",
  next4Weeks: "number",
});

// PlayerOwnership
const PlayerOwnershipType = type("'waivers'|'freeagents'");
export const PlayerOwnership = type({
  ownership_type: PlayerOwnershipType,
  waiver_date: "string?",
});

export const Player = type({
  player_key: "string",
  player_name: "string",
  eligible_positions: "string[]",
  display_positions: "string[]",
  selected_position: "string | null",
  is_editable: "boolean",
  is_playing: "boolean",
  injury_status: "string",
  percent_started: "number",
  percent_owned: "number",
  percent_owned_delta: "number",
  start_score: "number",
  ownership_score: "number",
  is_starting: "string|number",
  is_undroppable: "boolean",
  ranks: PlayerRanks,
  ownership: PlayerOwnership.optional(),
});

// TeamFirestore
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

// Team
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

// Schedule
export const Schedule = type({
  date: "string",
  games: type({ "['mlb'|'nba'|'nfl'|'nhl']": "number[]" }),
});

// TransactionsData
const TransactionType = type("'add'|'drop'|'add/drop'");
const TPlayer = type({
  playerKey: "string",
  transactionType: TransactionType,
  isInactiveList: "boolean",
  player: Player,
  isFromWaivers: "boolean?",
});
const PlayerTransaction = type({
  teamName: "string",
  leagueName: "string",
  teamKey: "string",
  sameDayTransactions: "boolean",
  description: "string",
  reason: "string | null",
  "isFaabRequired?": "boolean",
  players: TPlayer.array(),
});
const LineupChanges = type({
  teamKey: "string",
  coverageType: "string",
  coveragePeriod: "string",
  newPlayerPositions: "Record<string,string>",
});
const TransactionResults = type({
  postedTransactions: PlayerTransaction.array(),
  failedReasons: "string[]",
});
export const PostTransactionsResult = type({
  success: "boolean",
  transactionResults: TransactionResults,
});
export const TransactionsData = type({
  dropPlayerTransactions: PlayerTransaction.array().array().or("null"),
  lineupChanges: LineupChanges.array().or("null"),
  addSwapTransactions: PlayerTransaction.array().array().or("null"),
});

// FeedbackData
export const FeedbackData = type({
  userEmail: "string",
  feedbackType: "string",
  title: "string",
  message: "string",
});
