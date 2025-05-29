import { Leagues } from "@common/types/Leagues.js";
import { assertTrue } from "@common/utilities/checks.js";
import { type } from "arktype";
import type { GamesPlayed, InningsPitched } from "../../interfaces/Team.js";
import { flattenArray, parseToInt } from "../utilities.service.js";
import type { LeagueDetails } from "./interfaces/YahooAPIResponse.js";

const LeagueSettingsSchema = type({
  settings: "Record<string, unknown>[]",
});

const TeamInfoSchema = "Record<string, unknown>[]";
const RequestedTeamInfoSchema = "Record<string, unknown>[]";
const LeagueTeamsSchema = type({
  teams: {
    // the key is an index, ie. "0"
    "[string]": type({
      team: [TeamInfoSchema, "...", RequestedTeamInfoSchema],
    }).or("number"),
  },
});

const ExtendedLeagueSchema = LeagueSettingsSchema.and(LeagueTeamsSchema);

export function getLeagueSettingsAnduserTeam(
  leaguesJSON: LeagueDetails,
  leagueKey: string,
) {
  const league = leaguesJSON[leagueKey].league;
  const [baseLeague, ...extendedLeague] = league;
  const leagueDetails = LeagueDetailsSchema.assert(baseLeague);
  const extendedLeagueDetails = ExtendedLeagueSchema.assert(
    flattenArray(extendedLeague),
  );

  const leagueSettings = FlatLeagueSettingsSchema.assert(
    flattenArray(extendedLeagueDetails.settings),
  );

  const team = extendedLeagueDetails.teams[0];
  assertTrue(typeof team !== "number");
  const usersTeam = team.team;

  return { leagueDetails, leagueSettings, usersTeam };
}

// TODO: Reduce this to the required keys only?
const TransactionInfo = type({
  transaction_key: "string",
  type: "'waiver' | 'pending_trade'",
  status: "'pending' | 'proposed'",
  "waiver_player_key?": "string",
  "waiver_team_key?": "string",
  "waiver_team_name?": "string",
  "waiver_date?": "string.date",
  "waiver_roster_reflect_key?": "string.date",
  "waiver_priority?": "number",
  "waiver_priority_options?": {
    "0": { option: "number" },
    count: "number",
  },
  "faab_bid?": "string | number",
});

const TransactionPlayerInfo = "Record<string, unknown>[]";
const TransactionData = type({
  type: "'add' | 'drop' | 'pending_trade'",
  source_type: "'team' | 'waivers'",
  destination_type: "'team' | 'waivers'",
  "destination_team_key?": "string",
  "source_team_key?": "string",
});
const TransactionPlayerSchema = type([
  TransactionPlayerInfo,
  { transaction_data: TransactionData.or([TransactionData]) },
]);
export type TransactionPlayer = typeof TransactionPlayerSchema.infer;

const TransactionPlayers = type({
  players: {
    "[string]": type({
      player: TransactionPlayerSchema,
    }).or("number"), // TODO: Better way to handle the count: "number" in each union? count always reduces to string.
  },
});

export const TransactionDetailsSchema = type([
  TransactionInfo,
  TransactionPlayers,
]);
export type TransactionDetails = typeof TransactionDetailsSchema.infer;

const TransactionsSchema = type({
  "[string]": type({
    transaction: TransactionDetailsSchema,
  }).or("number"), // TODO: Better way to handle the count: "number" in each union? count always reduces to string.
});
type Transactions = typeof TransactionsSchema.infer;

export const TeamTransactionSchema = type({
  "transactions?": TransactionsSchema.or("never[]"),
});

export function createTransactionArray(
  transactions: Transactions | never[] | undefined,
): TransactionDetails[] {
  const result: TransactionDetails[] = [];

  for (const transaction of Object.values(transactions ?? {})) {
    if (typeof transaction !== "number") {
      result.push(transaction.transaction);
    }
  }

  return result;
}

const GamesPlayedDetailsSchema = type({
  games_played_by_position_type: {
    position_type: "string",
    // Pitchers only
    "innings_pitched?": {
      pitched: "string | number",
      max: "string | number",
      projected: "string | number",
    },
    // All other types of players
    "games_played?": type({
      games_played_by_position: {
        position: "string",
        games_played: {
          played: "number",
          max: "number",
          projected: "number",
        },
      },
    }).array(),
  },
}).array();

type GamesPlayedDetails = typeof GamesPlayedDetailsSchema.infer;

export const GamesPlayedSchema = type({
  "games_played?": GamesPlayedDetailsSchema,
});

export function getGamesPlayedArray(
  gamesPlayed: GamesPlayedDetails | undefined,
): GamesPlayed[] | undefined {
  return gamesPlayed
    ?.find(
      (element) => element.games_played_by_position_type.position_type !== "P",
    )
    ?.games_played_by_position_type.games_played?.map(
      (element) => element.games_played_by_position,
    );
}

export function getInningsPitchedArray(
  gamesPlayed: GamesPlayedDetails | undefined,
): InningsPitched | undefined {
  const inningsPitched = gamesPlayed?.find(
    (element) => element.games_played_by_position_type.position_type === "P",
  )?.games_played_by_position_type.innings_pitched;

  // inningsPitched is an object where all values are strings. Convert them all to numbers. before returning.
  return inningsPitched
    ? Object.entries(inningsPitched).reduce(
        (acc, [key, value]) => {
          acc[key as keyof InningsPitched] = Number(value);
          return acc;
        },
        { pitched: 0, max: 0, projected: 0 },
      )
    : undefined;
}

const RosterPositionsDetailsSchema = type({
  roster_position: {
    position: "string",
    "position_type?": "string",
    count: "string | number",
    is_starting_position: "number",
  },
}).array();
type RosterPositionsDetails = typeof RosterPositionsDetailsSchema.infer;

export const FlatLeagueSettingsSchema = type({
  "max_weekly_adds?": "string | number",
  "max_adds?": "string | number",
  "max_games_played?": "string | number",
  "max_innings_pitched?": "string | number",
  waiver_rule: "string",
  roster_positions: RosterPositionsDetailsSchema,
});

export const FlatGameDetailsSchema = type({
  name: "string",
  code: Leagues,
  season: "string",
  is_game_over: "number",
});

export const LeagueDetailsSchema = type({
  edit_key: "string",
  name: "string",
  num_teams: "number",
  start_date: "string",
  end_date: "string",
  weekly_deadline: "string",
  scoring_type: "string",
});

export const FlatTeamSchema = type({
  team_key: "string",
  name: "string",
  url: "string",
  team_logos: type({
    team_logo: {
      size: "string",
      url: "string",
    },
  }).array(),
  number_of_moves: "string | number",
  number_of_trades: "string | number",
  roster_adds: {
    value: "string | number",
  },
  "faab_balance?": "string | number",
});

export function getPositionCounts(rosterPositions: RosterPositionsDetails) {
  const result: { [position: string]: number } = {};

  for (const position of rosterPositions) {
    result[position.roster_position.position] = parseToInt(
      position.roster_position.count,
    );
  }

  return result;
}
