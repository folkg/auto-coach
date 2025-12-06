import type { FirestoreTeam, TeamOptimizer } from "@common/types/team.js";

import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";

import type { TopAvailablePlayers } from "../../common/services/yahooAPI/yahooTopAvailablePlayersBuilder.service";

import * as positionalScarcityService from "../../calcPositionalScarcity/services/positionalScarcity.service";
import * as yahooTopAvailablePlayersBuilder from "../../common/services/yahooAPI/yahooTopAvailablePlayersBuilder.service";
import {
  createPlayersTransactions,
  generateTopAvailablePlayerPromises,
  mergeTopAvailabePlayers,
} from "../services/processTransactions.service";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe.todo("test getTransactions and postTransactions functions");

describe("test mergeTopAvailabePlayers function", () => {
  test("four MLB teams", async () => {
    const topAvailablePlayersPromise = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/topAvailablePlayersPromise1.json");
    const nflTopAvailablePlayersPromise = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/nflTopAvailablePlayersPromise1.json");
    const restTopAvailablePlayersPromise = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/restTopAvailablePlayersPromise1.json");
    const expectedOutput = require("../../dispatchSetLineup/spec/topAvailablePlayers/output/output1.json");

    const result = await mergeTopAvailabePlayers(
      topAvailablePlayersPromise,
      nflTopAvailablePlayersPromise,
      restTopAvailablePlayersPromise,
    );

    expect(result).toEqual(expectedOutput);

    for (const team in result) {
      expect(result[team]?.length).toEqual(50);
    }
  });

  test("no teams adding players", async () => {
    const result = await mergeTopAvailabePlayers(
      Promise.resolve({}),
      Promise.resolve({}),
      Promise.resolve({}),
    );

    expect(result).toEqual({});
  });
});

describe("generateTopAvailablePlayerPromises", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(yahooTopAvailablePlayersBuilder, "fetchTopAvailablePlayersFromYahoo")
      .mockResolvedValue({});
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("no teams adding players", () => {
    const teams: FirestoreTeam[] = [
      { allow_adding: false, game_code: "mlb" },
      { allow_adding: false, game_code: "nfl" },
      { allow_adding: false, game_code: "nhl" },
    ] as FirestoreTeam[];
    const expectedOutput = [Promise.resolve({}), Promise.resolve({}), Promise.resolve({})];
    const result = generateTopAvailablePlayerPromises(teams, "testuid");
    expect(result).toEqual(expectedOutput);
  });

  it("should call the API three times", () => {
    const teams: FirestoreTeam[] = [
      { allow_adding: true, game_code: "mlb" },
      { allow_adding: true, game_code: "nfl" },
    ] as FirestoreTeam[];
    const expectedOutput = [Promise.resolve({}), Promise.resolve({}), Promise.resolve({})];

    const result = generateTopAvailablePlayerPromises(teams, "testuid");

    expect(result).toEqual(expectedOutput);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("should call the API two times (no NFL call)", () => {
    const teams: FirestoreTeam[] = [
      { allow_adding: true, game_code: "mlb" },
      { allow_adding: true, game_code: "nhl" },
    ] as FirestoreTeam[];
    const expectedOutput = [Promise.resolve({}), Promise.resolve({}), Promise.resolve({})];

    const result = generateTopAvailablePlayerPromises(teams, "testuid");

    expect(result).toEqual(expectedOutput);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should call the API two times (no rest call)", () => {
    const teams: FirestoreTeam[] = [
      { allow_adding: true, game_code: "nfl" },
      { allow_adding: true, game_code: "nfl" },
    ] as FirestoreTeam[];
    const expectedOutput = [Promise.resolve({}), Promise.resolve({}), Promise.resolve({})];

    const result = generateTopAvailablePlayerPromises(teams, "testuid");

    expect(result).toEqual(expectedOutput);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("createPlayersTransactions with positionalScarcity", () => {
  const positionalScarcityServiceSpy = vi.spyOn(
    positionalScarcityService,
    "getScarcityOffsetsForTeam",
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should drop the worst player (D) to make room for a player coming back from IR", async () => {
    positionalScarcityServiceSpy.mockResolvedValue({});

    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/topAvailablePlayersPromise2.json");

    const {
      dropPlayerTransactions: resultDropTransactions,
      lineupChanges: resultLineupChanges,
      addSwapTransactions: resultAddSwapTransactions,
    } = await createPlayersTransactions(rosters, addCandidates);

    const dropTransactionsPlayers = resultDropTransactions?.[0]?.flatMap((t) => t.players);

    expect(dropTransactionsPlayers?.length).toEqual(1);
    expect(dropTransactionsPlayers?.[0]?.player.eligible_positions).contain("D");
    expect(dropTransactionsPlayers?.[0]).toMatchObject({
      transactionType: "drop",
    });

    expect(resultLineupChanges).toBeNull();
    expect(resultAddSwapTransactions).toBeNull();
  });

  it("should drop a different player (non-D) to make room for a player coming back from IR (with positional scarcity enabled)", async () => {
    positionalScarcityServiceSpy.mockResolvedValue({
      C: 50,
      LW: 50,
      RW: 50,
      D: 30, // D is more scarce, so these players will be protected slightly more
      G: 50,
    });

    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/topAvailablePlayersPromise2.json");

    const {
      dropPlayerTransactions: resultDropTransactions,
      lineupChanges: resultLineupChanges,
      addSwapTransactions: resultAddSwapTransactions,
    } = await createPlayersTransactions(rosters, addCandidates);

    const dropTransactionsPlayers = resultDropTransactions?.[0]?.flatMap((t) => t.players);

    expect(dropTransactionsPlayers?.length).toEqual(1);
    expect(dropTransactionsPlayers?.[0]?.player.eligible_positions).not.contain("D");
    expect(dropTransactionsPlayers?.[0]).toMatchObject({
      transactionType: "drop",
    });

    expect(resultLineupChanges).toBeNull();
    expect(resultAddSwapTransactions).toBeNull();
  });

  it("should add top ranked player (SS) for a player moving to IR", async () => {
    positionalScarcityServiceSpy.mockResolvedValue({});

    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/testRosters/MLB/free1spotILswap.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/topAvailablePlayersPromise2.json");

    const {
      dropPlayerTransactions: resultDropTransactions,
      lineupChanges: resultLineupChanges,
      addSwapTransactions: resultAddSwapTransactions,
    } = await createPlayersTransactions(rosters, addCandidates);

    const addSwapTransactionsPlayers = resultAddSwapTransactions?.[0]?.flatMap((t) => t.players);

    expect(resultDropTransactions).toBeNull();

    expect(resultLineupChanges?.length).toEqual(1);
    expect(resultLineupChanges?.[0]).toMatchObject({
      newPlayerPositions: {
        "422.p.8918": "IL",
      },
    });

    expect(addSwapTransactionsPlayers?.length).toEqual(1);
    expect(addSwapTransactionsPlayers?.[0]?.player.eligible_positions).contain("SS");
    expect(addSwapTransactionsPlayers?.[0]).toMatchObject({
      transactionType: "add",
    });
  });

  it("should add a different player (non-SS) for a player moving to IR (with positional scarcity enabled)", async () => {
    positionalScarcityServiceSpy.mockResolvedValue({
      C: 1,
      "1B": 1,
      "2B": 1,
      "3B": 1,
      SS: 30, // SS is more plentiful, so these players will not be protected as much
      OF: 3,
      SP: 2,
      RP: 2,
      P: 4,
    });

    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/testRosters/MLB/free1spotILswap.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/topAvailablePlayersPromise2.json");

    const {
      dropPlayerTransactions: resultDropTransactions,
      lineupChanges: resultLineupChanges,
      addSwapTransactions: resultAddSwapTransactions,
    } = await createPlayersTransactions(rosters, addCandidates);

    const addSwapTransactionsPlayers = resultAddSwapTransactions?.[0]?.flatMap((t) => t.players);

    expect(resultDropTransactions).toBeNull();

    expect(resultLineupChanges?.length).toEqual(1);
    expect(resultLineupChanges?.[0]).toMatchObject({
      newPlayerPositions: {
        "422.p.8918": "IL",
      },
    });

    expect(addSwapTransactionsPlayers?.length).toEqual(1);
    expect(addSwapTransactionsPlayers?.[0]?.player.eligible_positions).not.contain("SS");
    expect(addSwapTransactionsPlayers?.[0]).toMatchObject({
      transactionType: "add",
    });
  });

  it("should drop for returning-IL and swap multiple players for a better player in free agency", async () => {
    positionalScarcityServiceSpy.mockResolvedValue({});

    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/problematicAddDrop/moveILtoBN-lineup.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/problematicAddDrop/healthyOnILShouldBeIllegal-addcandidates.json");

    const {
      dropPlayerTransactions: resultDropTransactions,
      lineupChanges: resultLineupChanges,
      addSwapTransactions: resultAddSwapTransactions,
    } = await createPlayersTransactions(rosters, addCandidates);

    const dropTransactionsPlayers = resultDropTransactions?.[0]?.flatMap((t) => t.players);
    const addSwapTransactionsPlayers = resultAddSwapTransactions?.[0]?.flatMap((t) => t.players);

    expect(dropTransactionsPlayers?.length).toEqual(1);
    expect(dropTransactionsPlayers?.[0]?.player.eligible_positions).contain("1B");

    expect(resultLineupChanges?.length).toEqual(1);
    expect(resultLineupChanges?.[0]).toMatchObject({
      newPlayerPositions: {
        "422.p.9558": "BN", // Player coming from IR
      },
    });

    expect(addSwapTransactionsPlayers?.length).toBeGreaterThan(1);
    expect(addSwapTransactionsPlayers?.[0]?.player.eligible_positions).not.contain("1B");
  });

  it("should drop for returning-IL and swap multiple players for a better player in free agency (with positional scarcity enabled, 1B)", async () => {
    positionalScarcityServiceSpy.mockResolvedValue({
      C: 50,
      "1B": 0,
      "2B": 50,
      "3B": 50,
      SS: 50,
      OF: 50,
      SP: 50,
      RP: 50,
      P: 50,
    });

    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/problematicAddDrop/moveILtoBN-lineup.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/problematicAddDrop/healthyOnILShouldBeIllegal-addcandidates.json");

    const {
      dropPlayerTransactions: resultDropTransactions,
      lineupChanges: resultLineupChanges,
      addSwapTransactions: resultAddSwapTransactions,
    } = await createPlayersTransactions(rosters, addCandidates);

    const dropTransactionsPlayers = resultDropTransactions?.[0]?.flatMap((t) => t.players);
    const addSwapTransactionsPlayers = resultAddSwapTransactions?.[0]?.flatMap((t) => t.players);

    expect(dropTransactionsPlayers?.length).toEqual(1);
    expect(dropTransactionsPlayers?.[0]?.player.eligible_positions).not.contain("1B");

    expect(resultLineupChanges?.length).toEqual(1);
    expect(resultLineupChanges?.[0]).toMatchObject({
      newPlayerPositions: {
        "422.p.9558": "BN",
      },
    });

    expect(addSwapTransactionsPlayers?.length).toBeGreaterThan(1);
    expect(addSwapTransactionsPlayers?.[0]?.player.eligible_positions).contain("1B");
  });

  it("should return the add / drop/ position lists as expected", async () => {
    const teamKey = "422.l.115494.t.4";
    positionalScarcityServiceSpy.mockResolvedValue({});
    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/problematicAddDrop/moveILtoBN-lineup.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/problematicAddDrop/healthyOnILShouldBeIllegal-addcandidates.json");

    const { topAddCandidatesList, topDropCandidatesList, playersAtPositionList } =
      await createPlayersTransactions(rosters, addCandidates);

    // Expect all add candidates to be better than all drop candidates
    expect(topAddCandidatesList?.[teamKey]?.length).toBeGreaterThan(0);
    expect(topDropCandidatesList?.[teamKey]?.length).toBeGreaterThan(0);
    const worstAddCandidate = topAddCandidatesList?.[teamKey]?.[0];
    const bestDropCandidate = topDropCandidatesList?.[teamKey]?.[0];

    expect(worstAddCandidate?.ownership_score ?? 0).toBeGreaterThan(
      bestDropCandidate?.ownership_score ?? 1,
    );

    // Expect all players on the roster to be counted as BN eligible
    expect(playersAtPositionList?.[teamKey]?.BN).toEqual(rosters[0]?.players.length);
  });

  it("should return the players added and dropped as the only candidates when applicable", async () => {
    const teamKey = "422.l.115494.t.4";
    positionalScarcityServiceSpy.mockResolvedValue({});
    const rosters: TeamOptimizer[] = [
      require("../../dispatchSetLineup/spec/problematicAddDrop/noDropCandidates.json"),
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/problematicAddDrop/healthyOnILShouldBeIllegal-addcandidates.json");

    const {
      topAddCandidatesList,
      topDropCandidatesList,
      addSwapTransactions,
      dropPlayerTransactions,
    } = await createPlayersTransactions(rosters, addCandidates);

    const droppedPlayers1 =
      dropPlayerTransactions?.[0]?.flatMap((t) => t.players).map((p) => p.playerKey) ?? [];
    const droppedPlayers2 =
      addSwapTransactions?.[0]
        ?.flatMap((t) => t.players)
        .filter((p) => p.transactionType === "drop")
        .map((p) => p.playerKey) ?? [];
    const droppedPlayerKeys = [...droppedPlayers1, ...droppedPlayers2];
    const addedPlayerKeys =
      addSwapTransactions?.[0]
        ?.flatMap((t) => t.players)
        .filter((p) => p.transactionType === "add")
        .map((p) => p.playerKey) ?? [];

    const topDropCandidateKeys = topDropCandidatesList?.[teamKey]?.map((p) => p.player_key) ?? [];
    const topAddCandidateKeys = topAddCandidatesList?.[teamKey]?.map((p) => p.player_key) ?? [];

    expect(droppedPlayerKeys).toEqual(topDropCandidateKeys);
    expect(addedPlayerKeys).toEqual(topAddCandidateKeys);
  });

  it("should not pick up a QB if the team is already at QB capacity (1) even with no dedicated QB spot(Q/W/R/T)", async () => {
    // TODO: Do we need a positional scrcity offset for QBs in this league? Or just don't pick them up?
    // 414.l.240994
    positionalScarcityServiceSpy.mockResolvedValue({
      WR: 0,
      RB: 3,
      TE: 1,
      DEF: 7,
      "Q/W/R/T": 3,
    });

    const rosters: TeamOptimizer[] = [
      require("../../common/services/yahooAPI/spec/testYahooLineupJSON/output/NFLLineupEmptySpot.json")[0],
    ];
    const addCandidates: TopAvailablePlayers = require("../../dispatchSetLineup/spec/topAvailablePlayers/promises/nflReal.json");
    const qbAddCandidates = addCandidates?.["414.l.240994.t.12"]
      ?.filter((p) => p.display_positions.includes("QB"))
      .map((p) => p.player_key);

    const { addSwapTransactions: resultAddSwapTransactions } = await createPlayersTransactions(
      rosters,
      addCandidates,
    );

    const addSwapTransactionsPlayers = resultAddSwapTransactions?.[0]?.flatMap((t) => t.players);

    // expect that we do not add any QB players since we already have 2 on the roster (max capacity is 1)
    const areQBsAdded = addSwapTransactionsPlayers?.some(
      (t) => t.transactionType === "add" && qbAddCandidates?.includes(t.playerKey),
    );
    expect(areQBsAdded).toBeFalsy();
  });
});
