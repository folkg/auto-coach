import { describe, expect, test, vi } from "vitest";
import * as yahooAPIService from "../yahooAPI.service.js";
import { fetchTopAvailablePlayersFromYahoo } from "../yahooTopAvailablePlayersBuilder.service.js";

// mock firebase-admin
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => {
  return {
    getApps: vi.fn(() => ["null"]),
    initializeApp: vi.fn(),
  };
});

describe("Test fetchTopAvailablePlayersFromYahoo", () => {
  test("Test Players", async () => {
    const teamKeys = ["422.l.90351.t.1"];
    const uid = "mzJVgridDRSG3zwFQxAuIhNro9V2";
    const yahooJSON = require("./testYahooPlayersJSON/yahooJSON/free-agents.json");

    vi.spyOn(yahooAPIService, "getTopAvailablePlayers").mockReturnValue(yahooJSON);

    const result = await fetchTopAvailablePlayersFromYahoo(teamKeys, uid);

    expect(result).toMatchSnapshot();
  });

  test("With waivers and freeagents", async () => {
    const teamKeys = ["422.l.115494.t.4", "422.l.16955.t.10"];
    const uid = "mzJVgridDRSG3zwFQxAuIhNro9V2";
    const yahooJSON = require("./testYahooPlayersJSON/yahooJSON/yahooJSONWaivers.json");

    vi.spyOn(yahooAPIService, "getTopAvailablePlayers").mockReturnValue(yahooJSON);

    const result = await fetchTopAvailablePlayersFromYahoo(teamKeys, uid);

    expect(result).toMatchSnapshot();
  });

  test("NFL", async () => {
    const teamKeys = ["423.l.784843.t.12"];
    const uid = "test";
    const yahooJSON = require("./testYahooPlayersJSON/yahooJSON/NFL.json");

    vi.spyOn(yahooAPIService, "getTopAvailablePlayers").mockReturnValue(yahooJSON);

    const result = await fetchTopAvailablePlayersFromYahoo(teamKeys, uid);

    expect(result).toMatchSnapshot();
  });
});
