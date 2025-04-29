import { describe, expect, it, test, vi } from "vitest";
import type { TeamOptimizer } from "../../common/interfaces/Team.js";
import * as yahooStartingPlayerService from "../../common/services/yahooAPI/yahooStartingPlayer.service.js";
import { LineupOptimizer } from "../classes/LineupOptimizer.js";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("Test LineupOptimizer Class MLB Daily", () => {
  test("Already optimal roster", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/optimal.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);

    expect(rosterModification).toEqual(null);
  });

  test("expect sample2 to move active BN players to Roster", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample2.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toMatchObject({
      "422.p.11232": "OF",
    });
  });
  test("expect sample3 to move Jimenez to OF, Glasnow to IL", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample3.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["OF", "Util"]).toContain(
      rosterModification?.newPlayerPositions["422.p.10439"],
    );
    expect(rosterModification?.newPlayerPositions["422.p.9616"]).toEqual("IL");
  });
  test("sample 1 should pass the isSuccessfullyOptimized test", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample1.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.10577": "OF",

      "422.p.9557": "BN",
      "422.p.10923": "SS",
      "422.p.10036": "2B",
      "422.p.9876": "Util",

      "422.p.10166": "C",
      "422.p.9096": "BN",

      "422.p.11014": "P",
      "422.p.11251": "BN",
    });
  });
  it("should move 2 starting pitchers to lineup, do nothing with bad starting batters on BN", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample4.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions["422.p.10660"]).toBeDefined();
    expect(rosterModification?.newPlayerPositions["422.p.11251"]).toBeDefined();
    expect(
      rosterModification?.newPlayerPositions["422.p.9557"],
    ).not.toBeDefined();
    expect(
      rosterModification?.newPlayerPositions["422.p.12339"],
    ).not.toBeDefined();
    expect(
      rosterModification?.newPlayerPositions["422.p.9096"],
    ).not.toBeDefined();
  });
  it("should move 2 starting pitchers to lineup, swap one non-starter to BN, leave other bad batters on BN", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample5.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions["422.p.10660"]).toBeDefined();
    expect(rosterModification?.newPlayerPositions["422.p.11251"]).toBeDefined();
    expect(rosterModification?.newPlayerPositions).toMatchObject({
      "422.p.9096": "C",
      "422.p.10166": "BN",
    });
    expect(
      rosterModification?.newPlayerPositions["422.p.9557"],
    ).not.toBeDefined();
    expect(
      rosterModification?.newPlayerPositions["422.p.12339"],
    ).not.toBeDefined();
  });
  it("should move unconfirmed good batters to roster in favour of bad confirmed batters", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample6.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.11265": "OF",
      "422.p.9858": "BN",
      "422.p.11855": "C",
      "422.p.9530": "BN",
    });
  });
  it("should move non-starting SP to BN in favour of unconfirmed RP using Pitchers Array", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample7.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    vi.spyOn(
      yahooStartingPlayerService,
      "getMLBStartingPitchers",
    ).mockReturnValue(["422.p.10597", "422.p.11398"]);
    expect(yahooStartingPlayerService.getMLBStartingPitchers()).toEqual([
      "422.p.10597",
      "422.p.11398",
    ]);

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.10970": "BN",
      "422.p.11750": "BN",
      "422.p.11251": "P",
      "422.p.10660": "P",
    });

    vi.restoreAllMocks();
  });

  it("should move non-starting SP to BN in favour of unconfirmed RP NOT using Pitchers Array", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/sample7.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.10970": "BN",
      "422.p.11750": "BN",
      "422.p.11251": "P",
      "422.p.10660": "P",
    });
  });
  it("should not alarm for empty roster positions where there are no players eligible to fill unfilled positions", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/unfilledRosterPositions.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.10504": "BN",
      "422.p.10566": "Util",
      "422.p.11391": "MI",
    });
  });
  it("should not move Roster player to BN in 3-way unless they are worse than playerA", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/bug1_higherScores.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification?.newPlayerPositions).toBeDefined();
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should not move Roster player to BN in 3-way unless they are worse than playerA(2)", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/bug2_higherScores.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    // TODO: Add output object as we expect it to be
    expect(rosterModification?.newPlayerPositions).toBeDefined();
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should optimize IL players in 3-way swap even playerB > playerC", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/bug3_higherScores.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification?.newPlayerPositions).toMatchObject({
      "422.p.9616": "IL",
      "422.p.11826": "BN",
      "422.p.9823": "P",
    });
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should move playerB to stack in 3-way and optimize the roster", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/bug4_higherScores.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification?.newPlayerPositions["422.p.8180"]).not.toEqual(
      "BN",
    );
    expect(
      rosterModification?.newPlayerPositions["422.p.10597"],
    ).not.toBeDefined();
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should NOT move player to IL if they are in a pending transaction (waiver)", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/pendingTransactionsWIL.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification).toEqual(null);
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it.todo(
    "should move player to IL if they are only in a proposed trade",
    () => {
      const roster: TeamOptimizer = require("./testRosters/MLB/pendingTransactionsTradeWIL.json");
      const lo = new LineupOptimizer(roster);
      lo.optimizeStartingLineup();
      const rosterModification = lo.lineupChanges;
      const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

      expect(rosterModification?.newPlayerPositions).toEqual({
        "422.p.10660": "IL",
        "422.p.106602": "BN",
      });
      expect(isSuccessfullyOptimized).toEqual(true);
    },
  );

  it("should NOT move player to IL if they are only in a proposed trade", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/bug_player_pending_trade.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification).toEqual(null);
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should NOT move player from IL to 'open' BN spot if there are pending added players", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/pendingTransactionsDiff+1.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification).toEqual(null);
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should move player from IL to 'open' BN spot if there are pending added players, but more empty spots", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/pendingTransactionsDiff+1ExtraSpot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.106602": "BN",
    });
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should move player from IL to 'open' BN spot if there are NOT pending added players", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/pendingTransactionsDiff0.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.106602": "BN",
    });
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("should move Altuve to BN and Walls to Util", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/userRequest_1.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(rosterModification?.newPlayerPositions).toEqual({
      "422.p.11891": "Util",
      "422.p.8996": "BN",
    });
    expect(isSuccessfullyOptimized).toEqual(true);
  });

  it("Should not be an infinte loop and timeout", () => {
    const roster: TeamOptimizer = require("./testRosters/MLB/infinite_loop_equal_score.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
  });
});
