import { type } from "arktype";
import { Player } from "./Player";

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

export type PlayerTransaction = typeof PlayerTransaction.infer;
export type TransactionsData = typeof TransactionsData.infer;
export type PostTransactionsResult = typeof PostTransactionsResult.infer;
export type TransactionResults = typeof TransactionResults.infer;
export type LineupChanges = typeof LineupChanges.infer;
export type TPlayer = typeof TPlayer.infer;

export type PlayerTransactionClient = PlayerTransaction & {
  selected: boolean;
  id: string;
};

export type TransactionsDataClient = {
  dropPlayerTransactions: PlayerTransactionClient[][] | null;
  lineupChanges: LineupChanges[] | null;
  addSwapTransactions: PlayerTransactionClient[][] | null;
};
