import { type } from "arktype";

import { PlayerSchema } from "./Player.js";

/**
 * TransactionsData and related types
 */
export const TransactionType = type("'add'|'drop'|'add/drop'");
export type TransactionType = typeof TransactionType.infer;

export const TPlayer = type({
  playerKey: "string",
  transactionType: TransactionType,
  isInactiveList: "boolean",
  player: PlayerSchema,
  isFromWaivers: "boolean?",
});
export type TPlayer = typeof TPlayer.infer;

export const PlayerTransaction = type({
  teamName: "string",
  leagueName: "string",
  teamKey: "string",
  sameDayTransactions: "boolean",
  description: "string",
  reason: "string | null",
  "isFaabRequired?": "boolean",
  players: TPlayer.array(),
});
export type PlayerTransaction = typeof PlayerTransaction.infer;

export const LineupChanges = type({
  teamKey: "string",
  coverageType: "string",
  coveragePeriod: "string",
  newPlayerPositions: "Record<string,string>",
});
export type LineupChanges = typeof LineupChanges.infer;

export const TransactionResults = type({
  postedTransactions: PlayerTransaction.array(),
  failedReasons: "string[]",
});
export type TransactionResults = typeof TransactionResults.infer;

export const PostTransactionsResult = type({
  success: "boolean",
  transactionResults: TransactionResults,
});
export type PostTransactionsResult = typeof PostTransactionsResult.infer;

export const TransactionsData = type({
  dropPlayerTransactions: PlayerTransaction.array().array().or("null"),
  lineupChanges: LineupChanges.array().or("null"),
  addSwapTransactions: PlayerTransaction.array().array().or("null"),
});
export type TransactionsData = typeof TransactionsData.infer;

// From Yahoo
// TODO: Reduce this to the required keys only?
const TransactionInfo = type({
  transaction_key: "string",
  type: "'waiver' | 'pending_trade'",
  status: "'pending' | 'proposed' | 'accepted'",
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

export const TransactionDetailsSchema = type([TransactionInfo, TransactionPlayers]);
export type TransactionDetails = typeof TransactionDetailsSchema.infer;
