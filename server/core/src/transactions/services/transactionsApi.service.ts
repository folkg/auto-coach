import type { TransactionsData } from "@common/types/transactions.js";
import { getTransactions, postTransactions } from "./processTransactions.service.js";

/**
 * Get transaction suggestions for a user
 *
 * @param uid - The user ID
 * @returns TransactionsData object with suggested transactions
 */
export function getTransactionSuggestions(uid: string): Promise<TransactionsData> {
  return getTransactions(uid);
}

/**
 * Process selected transactions for a user
 *
 * @param transactionData - The transaction data containing selected transactions
 * @param uid - The user ID
 * @returns Result of the transaction processing
 */
export function processSelectedTransactions(transactionData: TransactionsData, uid: string) {
  return postTransactions(transactionData, uid);
}
