import type { PlayerTransaction } from "@common/types/transactions.js";

export class PlayerTransactions {
  private _transactions: PlayerTransaction[] = [];

  public addTransaction(transaction: PlayerTransaction): void {
    this._transactions.push(transaction);
  }

  public get transactions(): PlayerTransaction[] {
    return this._transactions.slice();
  }

  public get droppedPlayerKeys(): string[] {
    return this._transactions
      .flatMap((transaction) => transaction.players)
      .filter((player) => player.transactionType === "drop")
      .map((player) => player.playerKey);
  }
}
