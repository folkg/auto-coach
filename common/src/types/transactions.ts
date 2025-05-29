import { type } from "arktype";
import { PlayerSchema } from "./Player";

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
