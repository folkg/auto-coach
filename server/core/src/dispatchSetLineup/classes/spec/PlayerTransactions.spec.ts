import type { PlayerTransaction, TPlayer } from "@common/types/transactions.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createMock } from "../../../common/spec/createMock";
import { PlayerTransactions } from "../PlayerTransactions";

describe("PlayerTransactions", () => {
  let playerTransactions: PlayerTransactions;
  let playerTransaction: PlayerTransaction;

  beforeAll(() => {
    playerTransactions = new PlayerTransactions();
    playerTransaction = createMock<PlayerTransaction>({
      teamKey: "test",
      sameDayTransactions: true,
      reason: "test",
      players: [
        createMock<TPlayer>({
          playerKey: "1",
          transactionType: "add",
          isInactiveList: false,
        }),
        createMock<TPlayer>({
          playerKey: "2",
          transactionType: "drop",
          isInactiveList: false,
        }),
        createMock<TPlayer>({
          playerKey: "3",
          transactionType: "add",
          isInactiveList: true,
        }),
        createMock<TPlayer>({
          playerKey: "4",
          transactionType: "drop",
          isInactiveList: true,
        }),
      ],
    });
    playerTransactions.addTransaction(playerTransaction);
  });

  it("should add a transaction", () => {
    expect(playerTransactions.transactions).toContain(playerTransaction);
  });

  it("should get dropped player keys", () => {
    expect(playerTransactions.droppedPlayerKeys).toEqual(["2", "4"]);
  });
});
