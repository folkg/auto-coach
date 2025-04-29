import { describe, expect, test, vi } from "vitest";
import type { TeamOptimizer } from "../../common/interfaces/Team.js";
import { LineupOptimizer } from "../classes/LineupOptimizer.js";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("Test LineupOptimizer Class NBA Weekly", () => {
  test("Optimal Lineup", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/optimalRoster.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);

    expect(rosterModification).toEqual(null);
  });

  // *** Test Optimization of Lineup using healthy players ***
  // 1 player to move into 1 empty roster spot
  test("1 player to move into 1 empty roster spot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/1PlayerToMoveInto1EmptyRosterSpot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5295": "PF",
    });
  });

  // 1 swap involving 2 players
  test("1 swap involving 2 players", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/1SwapInvolving2Players.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["SG", "G", "SF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6021"],
    );
    expect(rosterModification?.newPlayerPositions["418.p.3930"]).toEqual("BN");
  });

  // different 1 swap involving 2 players
  test("differet 1 swap involving 2 players", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/1SwapInvolving2Players(2).json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["SF", "PF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5295"],
    );
    expect(rosterModification?.newPlayerPositions["418.p.4725"]).toEqual("BN");
  });

  // two swaps required
  test("two swaps required", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/2SwapsRequired.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["SF", "PF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5295"],
    );
    expect(rosterModification?.newPlayerPositions["418.p.4725"]).toEqual("BN");
    expect(["SG", "G", "SF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6021"],
    );
    expect(rosterModification?.newPlayerPositions["418.p.3930"]).toEqual("BN");
  });

  // 1 swap required, 1 player to move into 1 empty roster spot
  test("1 swap required, 1 player to move into 1 empty roster spot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/1SwapRequired1PlayerToMoveInto1EmptyRosterSpot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5295": "PF",
      "418.p.4725": "BN",
      "418.p.6021": "G",
    });
    expect(["SF", "PF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5295"],
    );
    expect(rosterModification?.newPlayerPositions["418.p.4725"]).toEqual("BN");
    expect(["SG", "G", "SF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6021"],
    );
    expect(
      rosterModification?.newPlayerPositions &&
        Object.keys(rosterModification?.newPlayerPositions).length,
    ).toEqual(3);
  });
  // all players on bench
  test("all players on bench", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/allPlayersOnBench.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["PG", "SG", "G", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6404"],
    );
    expect(["PG", "SG", "G", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5826"],
    );
    expect(["SG", "G", "SF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6021"],
    );
    expect(["SF", "PF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6025"],
    );
    expect(["SF", "PF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5295"],
    );
    expect(["PF", "F", "C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6018"],
    );
    expect(["C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5352"],
    );
    expect(["C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5471"],
    );
    expect(["SF", "PF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.4901"],
    );
    expect(["C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6047"],
    );
  });
  // lineup with worst players on roster, best players on bench
  test("lineup with worst players on roster, best players on bench", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/lineupWithWorstPlayersOnRosterBestPlayersOnBench.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["PG", "SG", "G", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6404"],
    );
    expect(["PG", "SG", "G", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.5826"],
    );
    expect(["SG", "G", "SF", "F", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6021"],
    );
    expect(rosterModification?.newPlayerPositions).toMatchObject({
      "418.p.4725": "BN",
      "418.p.3930": "BN",
      "418.p.6035": "BN",
    });
  });

  // *** Test Optimization of Lineup using injured players ***
  // high score IL player on IL, low score IL player on bench, no spare IL slot
  test("high score IL player on IL, low score IL player on bench, no spare IL slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/highScoreILPlayerOnILLowScoreILPlayerOnBenchNoSpareILSlot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    // higher score player can stay on IL, doesn't need to be moved to bench if not ons tarting roster anyway
    expect(rosterModification).toEqual(null);
  });
  // high score IL player on IL, low score IL player on roster, no spare IL slot
  test("high score IL player on IL, low score IL player on roster, no spare IL slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/highScoreILPlayerOnILLowScoreILPlayerOnRosterNoSpareILSlot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["PF", "F", "C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6163"],
    );
    expect(rosterModification?.newPlayerPositions).toMatchObject({
      "418.p.6018": "IL",
    });
  });

  // high score IL+ player on IL+, low score IL+ player on bench, one spare IL+ slot
  test("high score IL+ player on IL+, low score IL+ player on bench, one spare IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/highScoreIL+PlayerOnIL+LowScoreIL+PlayerOnBenchOneSpareIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions["418.p.6035"]).toEqual("IL+");
    expect(["PF", "F", "C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6163"],
    );
  });
  // high score IL+ player on IL+, low score IL player on bench, no spare IL+ slot (expect direct swap)
  test("high score IL+ player on IL+, low score IL player on bench, one spare IL slot, no spare IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/highScoreIL+PlayerOnIL+LowScoreILPlayerOnBenchOneSpareILSlot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions["418.p.6035"]).toEqual("IL");
    expect(["PF", "F", "C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6163"],
    );
  });
  // high score IL+ player on IL+, low score IL player on bench, one spare IL slot
  test("medium score IL+ player on IL+, low score IL player on bench, one spare IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/mediumScoreIL+PlayerOnIL+LowScoreILPlayerOnBenchOneSpareILAndOneIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6035": "IL+",
      "418.p.6163": "BN",
    });
  });
  // high score IL player on IL, low score IL+ player on bench, one spare IL+ slot (expect IL+ player to IL+, IL player to bench)
  // TODO: The problem is that we need to move 6035 from BN to IL and 6163 from IL+ to BN in a three way swap to an empty IL+ slot.
  // We are not capturing this move into the empty position though.
  test("high score IL player on IL, low score IL+ player on bench, one spare IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/highScoreILPlayerOnILLowScoreIL+PlayerOnBenchOneSpareIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6035": "IL+",
      "418.p.6163": "BN",
    });
  });
  // high score IL player on IL, low score IL player on bench, lower score IL+ on bench, one spare IL+ slot (expect IL+ player to IL+, IL player to bench)
  test("high score IL player on IL, low score IL player on bench, lower score IL+ on bench, one spare IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/highScoreILPlayerOnILLowScoreILPlayerOnBenchLowerScoreIL+OnBenchOneSpareIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.3930": "IL+",
      "418.p.6163": "BN",
    });
  });

  // Two players on IL, two empty roster spots (expect move to BN or Roster)
  test("Two players on IL, two empty roster spots", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoPlayersOnILTwoEmptyRosterSpots.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5433": "BN",
      "418.p.6163": "BN",
    });
  });

  test("Two players on IL, one high score, two empty roster spots", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoPlayersOnILOneHighScoreTwoEmptyRosterSpots.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5433": "BN",
      "418.p.6163": "F",
      "418.p.6018": "BN",
    });
  });

  // *** Test Illegal players that should be resolved ***
  // low score healthy player on IL, IL player on bench (expect swap, healthy player to BN)
  test("low score healthy player on IL, IL player on bench", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/lowScoreHealthyPlayerOnILILPlayerOnBench.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6035": "IL",
      "418.p.6163": "BN",
    });
  });

  // high score healthy player on IL, IL player on bench (expect swap, healthy player to roster)
  test("high score healthy player on IL, IL player on bench", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/highScoreHealthyPlayerOnILILPlayerOnBench.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions["418.p.6035"]).toEqual("IL");
    expect(["PF", "F", "C", "Util"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6163"],
    );
  });

  // healthy player on IL, IL+ player on BN, 1 empty IL+ slot (expect healthy player moved to BN, IL+ player to IL+)
  test("healthy player on IL, IL+ player on BN, 1 empty IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/healthyPlayerOnILIL+PlayerOnBNOneEmptyIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6035": "IL+",
      "418.p.6163": "BN",
    });
  });

  // healthy player on IL, IL+ player on BN, no empty IL+ slot (expect no move)
  test("healthy player on IL, IL+ player on BN, 1 empty IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/healthyPlayerOnILIL+PlayerOnBNNoEmptyIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification).toEqual(null);
  });

  // healthy player on IL+, IL player on BN, 1 empty IL slot (expect healthy player moved to BN, IL player to IL)
  test("healthy player on IL+, IL player on BN, 1 empty IL slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/healthyPlayerOnIL+ILPlayerOnBNOneEmptyILSlot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions["418.p.6163"]).toEqual("BN");
    expect(["IL", "IL+"]).toContain(
      rosterModification?.newPlayerPositions["418.p.6035"],
    );
  });
  // healthy player on IL+, IL player on BN, no empty IL slot (expect swap)
  test("healthy player on IL+, IL player on BN, no empty IL slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/healthyPlayerOnIL+ILPlayerOnBNNoEmptyILSlot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6035": "IL+",
      "418.p.6163": "BN",
    });
  });
  // IL+ player on IL, no open IL+ slot (expect no move)
  test("IL+ player on IL, no open IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/IL+PlayerOnILNoOpenIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification).toEqual(null);
  });
  // IL+ player on IL, open IL+ slot (expect IL+ player to IL+)
  test("IL+ player on IL, open IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/IL+PlayerOnILOpenIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6163": "IL+",
    });
  });
  // IL+ player on IL, no open IL+ slot, IL player on BN (expect swap)
  test("IL+ player on IL, no open IL+ slot, IL player on BN", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/IL+PlayerOnILNoOpenIL+SlotILPlayerOnBN.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6163": "BN",
      "418.p.6035": "IL",
    });
  });

  // Two healthy players on IL, one empty roster spot (expect better player to roster)
  test("Two healthy players on IL, one empty roster spot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoHealthyPlayersOnILOneEmptyRosterSpot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6163": "BN",
    });
  });
  // Two healthy player on IL, one IL player on BN (expect better player to roster, IL player to IL)
  test("Two healthy player on IL, one IL player on BN", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoHealthyPlayerOnILOneILPlayerOnBN.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6163": "BN",
      "418.p.6035": "IL",
    });
  });

  // Two healthy players on IL, one empty roster spot, one IL player on BN (expect both healthy players to BN, IL player to IL)
  test("Two healthy players on IL, one empty roster spot, one IL player on BN", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoHealthyPlayersOnILOneEmptyRosterSpotOneILPlayerOnBN.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5433": "BN",
      "418.p.6035": "IL",
      "418.p.6163": "BN",
    });
  });

  // Two healthy players on IL, two IL on BN (expect all healthy players to BN, IL players to IL)
  test("Two healthy players on IL, two IL on BN", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoHealthyPlayersOnILTwoILOnBN.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5433": "BN",
      "418.p.6163": "BN",
      "418.p.6035": "IL",
      "418.p.4725": "IL",
    });
  });
  // Two healthy players on IL, one IL player on BN, one IL on Roster (expect all healthy players to BN, IL players to IL)
  test("Two healthy players on IL, one IL player on BN, one IL on Roster", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoHealthyPlayersOnILOneILPlayerOnBNOneILOnRoster.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toMatchObject({
      "418.p.5433": "BN",
      "418.p.6035": "IL",
      "418.p.6025": "IL",
      "418.p.6163": "BN",
      "418.p.4725": "SF",
    });
  });

  // Two healthy players on IL, one IL+ player on BN, one empty IL+ slot (expect better player to roster, IL+ player to IL+)
  test("Two healthy players on IL, one IL+ player on BN, one empty IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoHealthyPlayersOnILOneIL+PlayerOnBNOneEmptyIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6163": "BN",
      "418.p.3930": "IL+",
    });
  });
  // Two healthy players on IL, two IL+ player on BN, two empty IL+ slots (expect both healthy players to BN, IL+ players to IL+)
  test("Two healthy players on IL, two IL+ player on BN, two empty IL+ slots", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/twoHealthyPlayersOnILOneIL+PlayerOnBNTwoEmptyIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.6163": "BN",
      "418.p.3930": "IL+",
      "418.p.5433": "BN",
      "418.p.4725": "IL+",
    });
  });
  // One healthy player on IL, one IL+ player on BN, one IL player on IL+, no spare IL+ slot (expect IL player to IL, IL+ player to IL+, healthy player to BN)
  test("One healthy player on IL, one IL+ player on BN, one IL player on IL+, no spare IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/oneHealthyPlayerOnILOneIL+PlayerOnBNOneILPlayerOnIL+NoSpareIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5433": "BN",
      "418.p.6163": "IL",
      "418.p.4725": "IL+",
    });
  });

  test("One healthy player on IL, two IL+ player on BN, one IL player on IL+, no spare IL+ slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/oneHealthyPlayerOnILTwoIL+PlayerOnBNOneILPlayerOnIL+NoSpareIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5433": "BN",
      "418.p.6163": "IL",
      "418.p.3930": "IL+",
    });
  });

  // One healthy player on IL, one IL+ player on IL, one IL player on BN, one spare IL+ slot (expect IL+ player to IL+, IL player to IL, healthy player to BN)
  test("One healthy player on IL, one NA player on IL, one IL player on BN, one spare NA slot", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Weekly/oneHealthyPlayerOnILOneIL+PlayerOnILOneILPlayerOnBNOneSpareIL+Slot.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification?.newPlayerPositions).toEqual({
      "418.p.5433": "BN",
      "418.p.3930": "IL",
      "418.p.6163": "NA",
    });
  });
});
