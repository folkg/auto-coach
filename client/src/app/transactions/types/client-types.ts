import type {
  LineupChanges,
  PlayerTransaction,
} from "@common/types/transactions";

/**
 * Client-specific extension of PlayerTransaction with UI state
 */
export type PlayerTransactionClient = PlayerTransaction & {
  selected: boolean;
  id: string;
};

/**
 * Client-specific version of TransactionsData with UI state
 */
export type TransactionsDataClient = {
  dropPlayerTransactions: PlayerTransactionClient[][] | null;
  lineupChanges: LineupChanges[] | null;
  addSwapTransactions: PlayerTransactionClient[][] | null;
};
