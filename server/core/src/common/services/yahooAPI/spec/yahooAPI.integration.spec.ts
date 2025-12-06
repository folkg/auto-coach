import type { PlayerTransaction, TPlayer } from "@common/types/transactions.js";

import { createMock } from "@common/utilities/createMock";
import { beforeAll, describe, expect, it } from "vitest";

import {
  getRostersByTeamID,
  getTopAvailablePlayers,
  getUsersTeams,
  postRosterAddDropTransaction,
} from "../yahooAPI.service.js";

const integrationTestsEnabled = process.env.INTEGRATION_TEST_ENABLED === "true";

describe.runIf(integrationTestsEnabled)("Playground", () => {
  it("will get the roster for a specific team and day", async () => {
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2"; // Jeff BarnesintegrationTestsEnabled
    await getRostersByTeamID(["418.l.16955.t.10"], uid, "2023-08-13");
  });
});

describe.runIf(integrationTestsEnabled)("Yahoo API Live Integration Tests", () => {
  beforeAll(async () => {
    // Cannot quite get this to work. Revisit another time if we need to use integration tests.
    // const firebaseServiceAccountKey = require("../../../../../../auto-gm-372620-dd1695cac1a6.json");
    // firebaseAdmin.initializeApp({
    //   credential: firebaseAdmin.credential.cert(firebaseServiceAccountKey),
    // });
  });
  // const firebaseServiceAccountKey = require("../../../../../../auto-gm-372620-dd1695cac1a6.json");
  // Danger: This test will actually perform API calls to Yahoo! and will drop players if not mocked.
  it.runIf(integrationTestsEnabled)(
    "should actually make a move in Yahoo",
    async () => {
      const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2"; // Jeff Barnes

      const transaction = createMock<PlayerTransaction>({
        sameDayTransactions: true,
        teamKey: "418.l.201581.t.1",
        players: [
          createMock<TPlayer>({
            playerKey: "418.p.5295",
            transactionType: "drop",
          }),
          createMock<TPlayer>({
            playerKey: "418.p.5069",
            transactionType: "add",
          }),
        ],
      });

      expect.assertions(1);
      let result: unknown;
      try {
        result = await postRosterAddDropTransaction(transaction, uid);
      } catch (error) {
        console.error(error);
        expect(error).toBeDefined();
      }
      expect(result).toBeDefined();
    },
    10000,
  );

  it("should getRostersByTeamID", async () => {
    const uid = "mzJVgridDRSG3zwFQxAuIhNro9V2"; // Jeff Barnes
    const jsonResponse = await getRostersByTeamID(["422.l.90351.t.2 "], uid);
    expect(jsonResponse).toBeDefined();
  }, 10000);

  it("should getRostersByTeamID(2)", async () => {
    const uid = "LimuNc51OoelVHOOw4rQjWTflUh2"; // real user!!!
    const jsonResponse = await getRostersByTeamID(["422.l.20786.t.11"], uid);
    expect(jsonResponse).toBeDefined();
  }, 10000);

  it("should getUserTeams", async () => {
    const uid = "W8uNiMNNF8evwePX7aaFwvE8ojn1"; // Graeme Folk
    const JSONresponse = await getUsersTeams(uid);
    // const fs = require("fs");
    // fs.writeFileSync(
    //   "/home/graeme/Software/auto-gm/google-cloud-auto-gm/functions/src/fetchUsersTeams/services/spec/input.json",
    //   JSON.stringify(JSONresponse)
    // );
    expect(JSONresponse).toBeDefined();
  }, 10000);

  it("should get All available players", async () => {
    const uid = "mzJVgridDRSG3zwFQxAuIhNro9V2"; // Jeff Barnes
    const JSONresponse = await getTopAvailablePlayers(["422.l.90351.t.2"], uid);
    // const fs = require("fs");
    // fs.writeFileSync("./all-players.json", JSON.stringify(JSONresponse));
    expect(JSONresponse).toBeDefined();
  }, 10000);

  it("should get free agents only", async () => {
    const uid = "mzJVgridDRSG3zwFQxAuIhNro9V2"; // Jeff Barnes
    const JSONresponse = await getTopAvailablePlayers(["422.l.90351.t.2"], uid, "FA");
    // const fs = require("fs");
    // fs.writeFileSync("./free-agents.json", JSON.stringify(JSONresponse));
    expect(JSONresponse).toBeDefined();
  }, 10000);
});
