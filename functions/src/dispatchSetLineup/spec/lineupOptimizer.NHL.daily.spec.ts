import { LineupOptimizer } from "../classes/LineupOptimizer";
import { Team } from "../interfaces/Team";

// mock firebase-admin
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(),
}));

// Use this to mock the global NHL_STARTING_GOALIES array where needed
const yahooStartingGoalieService = require("../../common/services/yahooAPI/yahooStartingGoalie.service");

describe("Test LineupOptimizer Class NHL Daily", function () {
  // beforeEach(() => {
  //   jest.resetModules();
  // });

  // afterEach(() => {
  //   // restore the spy created with spyOn
  //   jest.restoreAllMocks();
  // });

  // *** Test Optimization of Lineup using healthy players ***
  test("Already optimal roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/optimalRoster.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);

    expect(rosterModification.newPlayerPositions).toEqual({});
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
  });

  test("One active C on bench, spare C slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/oneMoveRequired.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.3737": "C",
    });
    expect(Object.values(rosterModification.newPlayerPositions)).not.toContain(
      "BN"
    );
  });

  test("One active C on bench, one non-active C on roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/oneSwapRequired.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6726": "BN",
      "419.p.3737": "C",
    });
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
  });

  test("Different active C on bench, one non-active C on roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/oneSwapRequired2.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6726": "BN",
      "419.p.7528": "C",
    });
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
  });

  test("Two active players on bench, two non-active players on roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/twoSwapsRequired.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
    expect(rosterModification.newPlayerPositions["419.p.3737"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.3737"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.5992"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.5992"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions).toMatchObject({
      "419.p.6726": "BN",
      "419.p.6385": "BN",
    });
  });

  test("Two active players on bench, one non-active player on roster, one empty roster spot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/oneSwapOneMoveRequired.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
    expect(rosterModification.newPlayerPositions).toMatchObject({
      "419.p.6726": "BN",
      "419.p.6877": "LW",
    });
    expect(rosterModification.newPlayerPositions["419.p.3737"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.3737"]).not.toEqual(
      "BN"
    );
  });

  test("All players on bench", function () {
    const roster: Team = require("./testRosters/NHL/Daily/allPlayersBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(Object.values(rosterModification.newPlayerPositions)).not.toContain(
      "BN"
    );
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
    expect(
      Object.values(rosterModification.newPlayerPositions).filter(
        (v) => v === "C"
      ).length
    ).toEqual(2);
    expect(
      Object.values(rosterModification.newPlayerPositions).filter(
        (v) => v === "LW"
      ).length
    ).toEqual(2);
    expect(
      Object.values(rosterModification.newPlayerPositions).filter(
        (v) => v === "RW"
      ).length
    ).toEqual(2);
    expect(
      Object.values(rosterModification.newPlayerPositions).filter(
        (v) => v === "D"
      ).length
    ).toEqual(4);
    expect(
      Object.values(rosterModification.newPlayerPositions).filter(
        (v) => v === "Util"
      ).length
    ).toEqual(3);
    expect(
      Object.values(rosterModification.newPlayerPositions).filter(
        (v) => v === "G"
      ).length
    ).toEqual(2);
  });

  test("No players with games on active roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/allRosterPlayersHaveNoGames.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
    expect(rosterModification.newPlayerPositions["419.p.7163"]).toEqual("G");
    expect(rosterModification.newPlayerPositions["419.p.3737"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.3737"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.7528"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.7528"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.6877"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.6877"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.5441"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.5441"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.5391"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.5391"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.6060"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.6060"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.4930"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.4930"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.7910"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.7910"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.5992"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.5992"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.6184"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.6184"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.4687"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.4687"]).not.toEqual(
      "BN"
    );
    expect(rosterModification.newPlayerPositions["419.p.5020"]).toBeDefined();
    expect(rosterModification.newPlayerPositions["419.p.5020"]).not.toEqual(
      "BN"
    );
  });

  test("Lineup with worst players on roster, best players on bench", function () {
    const roster: Team = require("./testRosters/NHL/Daily/BadOnRosterGoodOnBench.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);

    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved

    expect(rosterModification.newPlayerPositions["419.p.7163"]).toEqual("G");
    expect(rosterModification.newPlayerPositions["419.p.7593"]).toEqual("BN");

    expect(rosterModification.newPlayerPositions["419.p.3737"]).toBeDefined();
    expect(["IR", "IR+", "BN"]).not.toContain(
      rosterModification.newPlayerPositions["419.p.3737"]
    );
    expect(rosterModification.newPlayerPositions["419.p.6726"]).toEqual("BN");

    expect(rosterModification.newPlayerPositions["419.p.5992"]).toBeDefined();
    expect(["IR", "IR+", "BN"]).not.toContain(
      rosterModification.newPlayerPositions["419.p.5992"]
    );
    expect(rosterModification.newPlayerPositions["419.p.5376"]).toBeDefined();
    expect(["IR", "IR+", "BN"]).not.toContain(
      rosterModification.newPlayerPositions["419.p.5376"]
    );
    expect(rosterModification.newPlayerPositions["419.p.4699"]).toBeDefined();
    expect(["IR", "IR+", "BN"]).not.toContain(
      rosterModification.newPlayerPositions["419.p.4699"]
    );
    expect(rosterModification.newPlayerPositions["419.p.5441"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions["419.p.6060"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions["419.p.7528"]).toEqual("BN");
  });

  test("Starting Goalies on Bench using NHL_STARTING_GOALIES array", function () {
    const roster: Team = require("./testRosters/NHL/Daily/startingGoaliesOnBench2.json");
    // mock NHL_STARTING_GOALIES array
    jest
      .spyOn(yahooStartingGoalieService, "getNHLStartingGoalies")
      .mockReturnValue(["419.p.7593", "419.p.7163"]);
    expect(yahooStartingGoalieService.getNHLStartingGoalies()).toEqual([
      "419.p.7593",
      "419.p.7163",
    ]);

    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
    expect(rosterModification.newPlayerPositions["419.p.5161"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions["419.p.7163"]).toEqual("G");
    expect(rosterModification.newPlayerPositions["419.p.7593"]).toEqual("G");

    // reset the mock configuration
    jest
      .spyOn(yahooStartingGoalieService, "getNHLStartingGoalies")
      .mockRestore();
  });

  test("Starting Goalies on Bench with no NHL_STARTING_GOALIES array set", function () {
    const roster: Team = require("./testRosters/NHL/Daily/startingGoaliesOnBench.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    // starting goalies array should not be defined since it was never set
    expect(
      yahooStartingGoalieService.getNHLStartingGoalies()
    ).not.toBeDefined();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(
      rosterModification.newPlayerPositions["419.p.6370"]
    ).not.toBeDefined(); // on IR+, should not be moved
    expect(rosterModification.newPlayerPositions["419.p.5161"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions["419.p.7163"]).toEqual("G");
    expect(rosterModification.newPlayerPositions["419.p.7593"]).toEqual("G");
  });

  // *** Test Illegal players that should be resolved ***
  test("Healthy not-playing, low score, player on IR, and IR on Bench", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HonIR&IRonBench.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.6726"]
    );
  });

  test("Healthy high score on IR, and IR on Bench", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HHighScoreonIR&IRonBench.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["C", "Util"]).toContain(
      rosterModification.newPlayerPositions["419.p.6370"]
    );
    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.6726"]
    );
  });

  test("Healthy on IR, IR on BN, and empty roster spot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HonIR&EmptyRosterSpot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    // expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "BN",
    });
  });

  test("Healthy high score on IR, IR on BN, and empty roster spot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HHighScoreonIR&EmptyRosterSpot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toBeDefined();
    expect(["IR", "IR+", "BN"]).not.toContain(
      rosterModification.newPlayerPositions["419.p.6370"]
    );
    expect(
      Object.keys(rosterModification.newPlayerPositions).length
    ).toBeGreaterThan(1);
  });

  test("Healthy player on IR, and IR+ on Bench with open IR+ slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HonIR&IR+OnRoster.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions["419.p.6726"]).toEqual("IR+");
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
  });

  test("Healthy player on IR, and IR+ on Bench with no open IR+ slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HonIR&IR+OnRosterNoOpenSlot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({});
    expect(Object.keys(rosterModification.newPlayerPositions).length).toEqual(
      0
    );
  });

  test("Healthy player on IR+, and IR on Bench with open IR slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HonIR+&IROnRoster.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions["419.p.6726"]).toEqual("IR");
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
  });

  test("Healthy player on IR+, and IR on Bench with no open IR slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/HonIR+&IROnRosterNoOpenSlot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toMatchObject({
      "419.p.6726": "IR+",
    });
    expect(["C", "Util"]).toContain(
      rosterModification.newPlayerPositions["419.p.6370"]
    );
  });

  test("IR+ player on IR, open IR+ slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/IR+onIR&OpenIR+Slot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "IR+",
    });
  });

  test("IR+ player on IR, no open IR+ slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/IR+onIR&NoOpenIR+Slot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({});
  });

  test("IR+ player on IR, no open IR+ slot, IR player on BN", function () {
    const roster: Team = require("./testRosters/NHL/Daily/IR+onIR&NoOpenIR+Slot&IRonBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions["419.p.6726"]).toEqual("IR");
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
    expect(Object.keys(rosterModification.newPlayerPositions).length).toEqual(
      2
    );
  });

  test("NA player on IR, no NA slots on roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/NAonIR&NoNASlotsOnRoster.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({});
  });

  test("NA player on IR, no NA slots on roster, empty roster position", function () {
    const roster: Team = require("./testRosters/NHL/Daily/NAonIR&NoNASlotsOnRoster&EmptyRosterPosition.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
    expect(Object.keys(rosterModification.newPlayerPositions).length).toEqual(
      1
    );
  });

  test("NA player on IR, open NA slot on roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/NAonIR&OpenNASlotOnRoster.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("NA");
    expect(Object.keys(rosterModification.newPlayerPositions).length).toEqual(
      1
    );
  });

  test("NA player on IR, no open NA slot on roster, IR player on Goalie", function () {
    const roster: Team = require("./testRosters/NHL/Daily/NAonIR&NoOpenNASlotOnRoster&IRonBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.7163"]
    );
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions["419.p.7593"]).toEqual("G");
  });

  test("Two healthy players on IR, one empty roster spot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2HealthyOnIR&1EmptyRosterSpot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.7593": "BN",
    });
  });

  test("Two healthy players on IR, one empty roster spot, one IR player on BN", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2HealthyOnIR&1EmptyRosterSpot&1IRonBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["C", "Util", "BN"]).toContain(
      rosterModification.newPlayerPositions["419.p.6370"]
    );
    expect(rosterModification.newPlayerPositions["419.p.7593"]).toEqual("BN");
    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.6385"]
    );
    expect(Object.keys(rosterModification.newPlayerPositions).length).toEqual(
      3
    );
  });

  test("Two healthy players on IR, two IR on bench, Healthy G on IR has score of 0", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2HealthyOnIR&2IRonBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(Object.keys(rosterModification.newPlayerPositions).length).toEqual(
      4
    );
    expect(rosterModification.newPlayerPositions["419.p.7593"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.6385"]
    );
    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.6726"]
    );
  });

  // TODO: Add test case: playerA on IR (NOT IR+ eligible), playerB on IR+ (IR, NA eligible), open NA spot.

  test("Two healthy players on IR, one IR player on BN, no IR+ slots open", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2HealthyOnIR&1IRonBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.7593": "BN",
      "419.p.6385": "IR",
    });
  });

  test("Two healthy players on IR, one IR+ player on BN", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2HealthyOnIR&1IR+onBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.7593": "BN",
      "419.p.6385": "IR+",
    });
  });

  test("Two healthy players on IR, two IR+ player on BN", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2HealthyOnIR&2IR+onBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.7593": "BN",
      "419.p.6370": "BN",
      "419.p.6385": "IR+",
      "419.p.6726": "IR+",
    });
  });

  test("One healthy player on IR, one IR+ player on BN, one IR player on IR+, no spare IR+ slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1HealthyOnIR&1IR+onBN&1IRonIR+&NoSpareIR+Slot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "BN",
      "419.p.6385": "IR+",
      "419.p.63702": "IR",
    });
  });

  test("One healthy player on IR, one IR+ player on LW, one IR player on IR+, no spare IR+ slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1HealthyOnIR&1IR+onLW&1IRonIR+&NoSpareIR+Slot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toMatchObject({
      "419.p.6370": "BN",
      "419.p.5441": "IR+",
      "419.p.63702": "IR",
    });
  });

  // One healthy on IR, one IR on NA, one NA on Util
  test("One healthy on IR, one IR on NA, one NA on Util", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1HealthyOnIR&1IRonNA&1NAonUtil.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toMatchObject({
      "419.p.6370": "BN",
      "419.p.5980": "NA",
      "419.p.63702": "IR",
    });
  });
  // One IR+ on IR, one IR on NA, one NA on IR+
  test("One IR+ on IR, one IR on NA, one NA on IR+", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1IR+onIR&1IRonNA&1NAonIR+.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "IR+",
      "419.p.63703": "NA",
      "419.p.63702": "IR",
    });
  });
  // One IR+ on IR, one IR on NA, one NA on IR+, two other swaps required
  test("One IR+ on IR, one IR on NA, one NA on IR+, two other swaps required", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1IR+onIR&1IRonNA&1NAonIR+2More.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toMatchObject({
      "419.p.6370": "IR+",
      "419.p.63703": "NA",
      "419.p.63702": "IR",
    });
    expect(Object.keys(rosterModification.newPlayerPositions).length).toEqual(
      7
    );
  });
  // One healthy on IR, one IR+ on IR, one IR on NA, one NA on IR+ (expect healthy to remain on IR)
  test("One healthy on IR, one IR+ on IR, one IR on NA, one NA on IR+", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1HealthyOnIR&1IR+onIR&1IRonNA&1NAonIR+.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "IR+",
      "419.p.63703": "NA",
      "419.p.63702": "IR",
    });
  });
  // One healthy on IR, one IR+ on IR, one IR on NA, one NA on IR+, one IR on G
  test("One healthy on IR, one IR+ on IR, one IR on NA, one NA on IR+, one IR on G", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1HealthyOnIR&1IR+onIR&1IRonNA&1NAonIR+&1IRonG.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "IR+",
      "419.p.63703": "NA",
      "419.p.63702": "IR",
      "419.p.6370ns": "BN",
      "419.p.7593": "IR",
    });
  });

  test("Two IR players on IR+, one IR+ player on BN, no spare IR+ slot, 1 spare IR slot, One HonIR", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2IRonIR+&1IR+onBN&NoSpareIR+Slot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);

    expect(["C", "Util", "BN"]).toContain(
      rosterModification.newPlayerPositions["419.p.37372"]
    );
    expect(rosterModification.newPlayerPositions["419.p.5376"]).toEqual("IR+");
    expect([
      rosterModification.newPlayerPositions["419.p.6370"],
      rosterModification.newPlayerPositions["419.p.63702"],
    ]).toContain("IR");
  });

  test("Two IR players on IR+, one IR+ player on BN, all other players on BN, One HonIR", function () {
    const roster: Team = require("./testRosters/NHL/Daily/2IRonIR+&1IR+onBN&AllOtherPlayersOnBN.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);

    expect(["C", "Util", "BN"]).toContain(
      rosterModification.newPlayerPositions["419.p.37372"]
    );
    expect(rosterModification.newPlayerPositions["419.p.5376"]).toEqual("IR+");
    expect([
      rosterModification.newPlayerPositions["419.p.6370"],
      rosterModification.newPlayerPositions["419.p.63702"],
    ]).toContain("IR");
  });

  test("One healthy player on IR, one IR player on BN, one IR+ player on IR, one spare IR+ slot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/1HealthyOnIR&1IRonBN&1IR+onIR&1SpareIR+Slot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "BN",
      "419.p.6385": "IR",
      "419.p.63702": "IR+",
    });
  });

  // ***Test cases where a player randomly ends up in an illegal position? ie. C on LW? Would yahoo ever remove eligibility?
  test("C stuck on LW, open C position", function () {
    const roster: Team = require("./testRosters/NHL/Daily/CStuckOnLW.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.3737": "C",
      "419.p.5441": "LW",
    });
  });

  test("C stuck on LW, no open C position", function () {
    const roster: Team = require("./testRosters/NHL/Daily/CStuckOnLWSwapRequired.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.3737": "C",
      "419.p.5376": "BN",
      "419.p.5441": "LW",
    });
  });

  test("Worse IR player on bench, better IR player on IR", function () {
    const roster: Team = require("./testRosters/NHL/Daily/WorseIRPlayerOnBench.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.5376"]
    );
    expect(rosterModification.newPlayerPositions["419.p.6370"]).toEqual("BN");
  });

  // Three way swap. BN has RW eligiblity, RW has RW,LW eligiblity, LW is open spot
  test("Three way swap with open LW spot", function () {
    const roster: Team = require("./testRosters/NHL/Daily/threeWaySwapWithOpenLWSpot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.5391": "LW",
      "419.p.6726": "RW",
    });
  });

  // Three way swap. BN has RW eligiblity, RW has RW,LW eligiblity, LW is open spot
  // BN has Util eligiblity, Util has RW,LW eligiblity, LW is open spot
  // TODO: Problematic test! Infinte loop? Why can't I get anything out of this test?
  test("Two three-way swap with two open LW", function () {
    const roster: Team = require("./testRosters/NHL/Daily/threeWaySwapsWithTwoOpenLWSpot.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.5391": "LW",
      "419.p.6726": "RW",
      "419.p.5376": "Util",
      "419.p.5020": "LW",
    });
  });

  // Three way swap. BN has RW eligiblity, RW has RW,LW eligiblity, LW is lower score
  test("Specific three way swap", function () {
    const roster: Team = require("./testRosters/NHL/Daily/threeWaySwapSpecific.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.5391": "LW",
      "419.p.6726": "RW",
      "419.p.5441": "BN",
    });
  });

  test("Two players on IR/IR+, two empty roster spots", function () {
    const roster: Team = require("./testRosters/NHL/Daily/twoPlayersOnIRTwoEmptyRosterSpots.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);
    expect(rosterModification.newPlayerPositions).toEqual({
      "419.p.6370": "BN",
      "419.p.63702": "BN",
    });
  });

  test("Injured players on BN, not playing players on Roster", function () {
    const roster: Team = require("./testRosters/NHL/Daily/injuredPlayersOnBenchNotPlayingPlayersOnRoster.json");
    const lo = new LineupOptimizer(roster);
    const { rosterModification } = lo.optimizeStartingLineup();
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();

    expect(isSuccessfullyOptimized).toEqual(true);

    expect(["IR", "IR+"]).toContain(
      rosterModification.newPlayerPositions["419.p.6726"]
    );
    expect(["BN", "LW", "Util"]).toContain(
      rosterModification.newPlayerPositions["419.p.6877"]
    );

    expect(["C", "Util"]).toContain(
      rosterModification.newPlayerPositions["419.p.6370"]
    );
    expect(["D", "Util"]).toContain(
      rosterModification.newPlayerPositions["419.p.4930"]
    );
    expect(rosterModification.newPlayerPositions["419.p.3737"]).toEqual("BN");
    expect(rosterModification.newPlayerPositions["419.p.5980"]).toEqual("BN");
  });
});
