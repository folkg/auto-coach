import { describe, expect, it } from "vitest";
import { SortTeamsByTransactionsPipe } from "./sort-teams-by-transactions.pipe";

describe("SortTeamsByTransactionsPipe", () => {
  it("create an instance", () => {
    const pipe = new SortTeamsByTransactionsPipe();
    expect(pipe).toBeTruthy();
  });

  it.todo("more tests");
});
