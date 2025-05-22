import type { TransactionsData as CommonTransactionsData } from "@common/src/types/transactions";
import { getTransactions, postTransactions } from "./processTransactions.service.js";

/**
 * Get transaction suggestions for a user
 * 
 * @param uid - The user ID
 * @returns TransactionsData object with suggested transactions
 */
export async function getTransactionSuggestions(uid: string): Promise<CommonTransactionsData> {
  // Get transactions suggestions from the core service
  return await getTransactions(uid);
}

/**
 * Process selected transactions for a user
 * 
 * @param transactionData - The transaction data containing selected transactions
 * @param uid - The user ID
 * @returns Result of the transaction processing
 */
export async function processSelectedTransactions(transactionData: CommonTransactionsData, uid: string) {
  // Process the selected transactions using the core service
  return await postTransactions(transactionData, uid);
}