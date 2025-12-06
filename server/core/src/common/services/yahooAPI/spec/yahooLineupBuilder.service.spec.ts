import { describe, expect, test, vi } from "vitest";

import * as yahooAPIService from "../yahooAPI.service.js";
import { fetchRostersFromYahoo } from "../yahooLineupBuilder.service.js";

// mock firebase-admin
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

// To mock the result from yahooAPI getRostersByTeamID()
describe("Test fetchRostersFromYahoo", () => {
  test("Elite League roster", async () => {
    const teams = ["419.l.28340.t.1"];
    const uid = "RLSrRcWN3lcYbxKQU1FKqditGDu1";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/419.l.28340.t.1.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toMatchSnapshot();
  });

  test("Irish Lacrosse roster - weekly max pickups", async () => {
    const teams = ["419.l.28340.t.1"];
    const uid = "RLSrRcWN3lcYbxKQU1FKqditGDu1";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/419.l.19947.t.6.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toMatchSnapshot();
  });

  test("NBA Weekly League - not editable", async () => {
    const teams = ["419.l.28340.t.1"];
    const uid = "RLSrRcWN3lcYbxKQU1FKqditGDu1";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/NBAWeeklyNotEditable.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toEqual([]);
  });

  test("NBA Weekly League - editable", async () => {
    const teams = ["419.l.28340.t.1"];
    const uid = "RLSrRcWN3lcYbxKQU1FKqditGDu1";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/NBAWeekly.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toMatchSnapshot();
  });

  test("Two NHL, two NBA for Jeff Barnes", async () => {
    const teams = ["419.l.91560.t.5", "419.l.91564.t.11", "418.l.201581.t.1", "418.l.200641.t.9"]; // Jeff Barnes
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/2NHL&1NBA.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toMatchSnapshot();
  });

  test("MLB with pending waiver claim", async () => {
    const teams = ["422.l.115494.t.4"];
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/MLB.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toMatchSnapshot();
  });

  test("MLB with multiple pending transactions", async () => {
    const teams = ["test"];
    const uid = "test";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/MLBpendingTransactions.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toMatchSnapshot();
  });

  test("2 NFL Teams", async () => {
    const teams = ["414.l.240994.t.12", "414.l.358976.t.4"];
    const uid = "test";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/NFLLineups.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(teams, uid);

    expect(result).toMatchSnapshot();
  });

  test("With postponed games", async () => {
    const teams = ["422.l.115494.t.4"];
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2";
    const yahooJSON = require("./testYahooLineupJSON/yahooJSON/MLB.json");

    // mock the JSON result from yahooAPI getRostersByTeamID()
    vi.spyOn(yahooAPIService, "getRostersByTeamID").mockReturnValue(yahooJSON);

    const result = await fetchRostersFromYahoo(
      teams,
      uid,
      "",
      // mock the postponed games
      new Set(["mlb.t.23", "mlb.t.26"]),
    );

    expect(result).toMatchSnapshot();
  });
});
