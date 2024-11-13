import { describe, expect, it, vi } from "vitest";
import {
  ITeamFirestore,
  ITeamOptimizer,
} from "../../common/interfaces/ITeam.js";
import * as firestoreService from "../../common/services/firebase/firestore.service.js";
import * as yahooAPI from "../../common/services/yahooAPI/yahooAPI.service.js";
import * as processTransactionsService from "../../transactions/services/processTransactions.service";
import { LineupChanges } from "../interfaces/LineupChanges.js";
import {
  performWeeklyLeagueTransactions,
  setUsersLineup,
} from "../services/setLineups.service.js";
import * as LineupBuilderService from "../../common/services/yahooAPI/yahooLineupBuilder.service.js";
import * as TopAvailablePlayersService from "../../common/services/yahooAPI/yahooTopAvailablePlayersBuilder.service.js";
import * as ScheduleSetLineupService from "../../scheduleSetLineup/services/scheduleSetLineup.service.js";
import * as positionalScarcityService from "../../calcPositionalScarcity/services/positionalScarcity.service";

// mock firebase-admin
vi.mock("firebase-admin/firestore", () => {
  return {
    getFirestore: vi.fn(),
  };
});
vi.mock("firebase-admin/app", () => {
  return {
    getApps: vi.fn(() => ["null"]),
    initializeApp: vi.fn(),
  };
});

// mock initialize starting goalies/pitchers
vi.mock("../../common/services/yahooAPI/yahooStartingPlayer.service", () => ({
  initStartingGoalies: vi.fn(),
  initStartingPitchers: vi.fn(),
  getNHLStartingGoalies: vi.fn().mockReturnValue([]),
  getMLBStartingPitchers: vi.fn().mockReturnValue([]),
}));

// mock Firestore services
const spyUpdateTeamFirestore = vi
  .spyOn(firestoreService, "updateTeamFirestore")
  .mockResolvedValue();

vi.spyOn(firestoreService, "getPositionalScarcityOffsets").mockResolvedValue(
  {}
);
vi.spyOn(firestoreService, "getRandomUID").mockResolvedValue("1");
vi.spyOn(
  firestoreService,
  "updatePositionalScarcityOffset"
).mockResolvedValue();
vi.spyOn(
  positionalScarcityService,
  "getScarcityOffsetsForTeam"
).mockResolvedValue({});

vi.spyOn(yahooAPI, "getTopPlayersGeneral").mockResolvedValue({});

describe("Full Stack Add Drop Tests in setUsersLineup()", () => {
  // Notes:
  // fetchRostersFromYahoo() should throw an error and cause the function to eit.skip.
  // putLineupChanges() should throw an error and cause the function to eit.skip.
  // postRosterAddDropTransaction() should have caught errors and allow the function to continue.
  it("should patch differences between Yahoo and Firestore teams", async () => {
    const uid = "testUID";
    const teamKey = "419.l.28340.t.1";
    const teams = [{ uid, team_key: teamKey, start_date: 1, end_date: 1 }];

    const rosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/Daily/optimalRoster.json"),
    ];

    const spyFetchRostersFromYahoo = vi
      .spyOn(LineupBuilderService, "fetchRostersFromYahoo")
      .mockResolvedValue(rosters);

    // mock the API calls
    vi.spyOn(yahooAPI, "putLineupChanges").mockResolvedValue();
    vi.spyOn(yahooAPI, "postRosterAddDropTransaction").mockResolvedValue(null);
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
    expect(spyUpdateTeamFirestore).toHaveBeenCalledTimes(1);
    expect(spyUpdateTeamFirestore).toHaveBeenCalledWith(uid, teamKey, {
      start_date: 1617220000,
      end_date: 1817220000,
    });
  });

  it("should do nothing for already optimal lineup", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }];

    const rosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/Daily/optimalRoster.json"),
    ];

    const spyFetchRostersFromYahoo = vi
      .spyOn(LineupBuilderService, "fetchRostersFromYahoo")
      .mockResolvedValue(rosters);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyPutLineupChanges).not.toHaveBeenCalled();
    expect(spyPostRosterAddDropTransaction).not.toHaveBeenCalled();
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
  });

  // user with multiple teams, no changes
  it("should do nothing for two already optimal lineup", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }];

    const rosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/noDropsRequired.json"),
      require("./testRosters/NHL/IntradayDrops/noDropsRequired.json"),
    ];

    const spyFetchRostersFromYahoo = vi
      .spyOn(LineupBuilderService, "fetchRostersFromYahoo")
      .mockResolvedValue(rosters);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyPutLineupChanges).not.toHaveBeenCalled();
    expect(spyPostRosterAddDropTransaction).not.toHaveBeenCalled();
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
  });

  // user with multiple teams, rosterModifications only
  it("should have two roster changes, no transactions", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }];

    const rosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/Daily/oneSwapRequired.json"),
      require("./testRosters/NBA/Weekly/1SwapRequired1PlayerToMoveInto1EmptyRosterSpot.json"),
    ];
    const expectedRosterModifications: LineupChanges[] = [
      {
        coveragePeriod: "2023-02-28",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.6726": "BN",
          "419.p.3737": "C",
        },
        teamKey: "419.l.28340.t.1",
      },
      {
        coveragePeriod: "2023-03-08",
        coverageType: "date",
        newPlayerPositions: {
          "418.p.5295": "PF",
          "418.p.4725": "BN",
          "418.p.6021": "G",
        },
        teamKey: "418.l.201581.t.1",
      },
    ];
    const spyFetchRostersFromYahoo = vi
      .spyOn(LineupBuilderService, "fetchRostersFromYahoo")
      .mockResolvedValue(rosters);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedRosterModifications,
      uid
    );
    expect(spyPostRosterAddDropTransaction).not.toHaveBeenCalled();
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
  });

  // - Drop players with same day transactions, lineup optimization (Intraday)
  it("should have one transaction, one refetch, then one lineup change (Intraday)", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/IntradayDrops/dropTwoPlayersWithLowestScore.json"),
    ];
    const updatedRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/IntradayDrops/RefetchedRosters/dropTwoPlayersWithLowestScore.json"),
    ];
    const transaction1 = {
      players: [
        {
          playerKey: "419.p.7528",
          transactionType: "drop",
          isInactiveList: false,
          player: expect.objectContaining({}),
        },
      ],
    };
    const transaction2 = {
      players: [
        {
          playerKey: "419.p.7903",
          transactionType: "drop",
          isInactiveList: false,
          player: expect.objectContaining({}),
        },
      ],
    };

    const expectedLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-03-17",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.6377": "BN",
          "419.p.63772": "BN",
        },
        teamKey: "419.l.19947.t.6",
      },
    ];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(updatedRosters);
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(2);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedLineupChanges,
      uid
    );

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(2);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledWith(
      expect.objectContaining(transaction1),
      uid
    );
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledWith(
      expect.objectContaining(transaction2),
      uid
    );
  });
  // - Drop players with next day transactions, with lineup optimization (Daily)
  it("should have one lineup change, then one refetch, then one drop (Daily)", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization.json"),
    ];
    const tomorrowRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/RefetchedRosters/dropPlayerWithLowestScoreAndOptimization.json"),
    ];

    // we are moving the player from BN to D today, and then dropping tomorrow. No big deal.
    const expectedLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-03-17",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.7155": "D",
          "419.p.5703": "BN",
        },
        teamKey: "419.l.28340.t.1",
      },
    ];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(tomorrowRosters);
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(2);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedLineupChanges,
      uid
    );

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalled();
  });

  it("Drop one player to make room for healthy on IR (daily)", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization.json"),
    ];
    const tomorrowRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/RefetchedRosters/dropPlayerWithLowestScoreAndOptimization.json"),
    ];

    const transaction1 = {
      players: [
        {
          isInactiveList: false,
          playerKey: "419.p.7155",
          transactionType: "drop",
          player: expect.objectContaining({}),
        },
      ],
    };

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(tomorrowRosters);
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(2);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalled();
  });

  it("should drop none, since the worst player is the healthy player on IL", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization2.json"),
    ];
    const tomorrowRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/RefetchedRosters/dropPlayerWithLowestScoreAndOptimization.json"),
    ];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(tomorrowRosters);
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(0);
  });

  it("should have one lineup change, then one refetch, then one drop (again)", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NBA/Daily/oneDropRequiredWithOptimization.json"),
    ];
    const tomorrowRosters: ITeamOptimizer[] = [
      require("./testRosters/NBA/Daily/RefetchedRosters/oneDropRequiredWithOptimization.json"),
    ];

    const expectedLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-03-26",
        coverageType: "date",
        newPlayerPositions: {
          "418.p.5471": "BN",
          "418.p.5826": "Util",
        },
        teamKey: "418.l.201581.t.1",
      },
    ];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(tomorrowRosters);
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(2);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedLineupChanges,
      uid
    );

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalled();
  });

  // user with multiple teams, playerTransactions and multiple calls to postRosterModifications (one intraday, one next day)
  it("should have one drop, refetch, two lineup changes, then refetch and drop (again)", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/IntradayDrops/dropTwoPlayersWithLowestScore.json"),
      require("./testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization.json"),
    ];
    const updatedRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/IntradayDrops/RefetchedRosters/dropTwoPlayersWithLowestScore.json"),
      require("./testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization.json"),
    ];
    const tomorrowRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/RefetchedRosters/dropPlayerWithLowestScoreAndOptimization.json"),
    ];

    const expectedLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-03-17",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.6377": "BN",
          "419.p.63772": "BN",
        },
        teamKey: "419.l.19947.t.6",
      },
      {
        coveragePeriod: "2023-03-17",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.7155": "D",
          "419.p.5703": "BN",
        },
        teamKey: "419.l.28340.t.1",
      },
    ];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(updatedRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(tomorrowRosters);

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValueOnce(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(3);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedLineupChanges,
      uid
    );

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalled();
  });

  it("should have two lineup changes, and no add drops because prop doesn't exist (legacy teams)", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/IntradayDrops/dropTwoPlayersWithLowestScoreNoDropProp.json"),
      require("./testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimizationNoDropProp.json"),
    ];

    const expectedLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-03-17",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.7155": "D",
          "419.p.5703": "BN",
        },
        teamKey: "419.l.28340.t.1",
      },
    ];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedLineupChanges,
      uid
    );

    expect(spyPostRosterAddDropTransaction).not.toHaveBeenCalled();
  });

  it("should add one player and then move them to the active roster (Intraday)", async () => {
    const uid = "testUID";
    const teams = [
      { team_key: "422.l.115494.t.4", allow_adding: true, game_code: "MLB" },
    ];
    const transaction1 = {
      players: [
        {
          isInactiveList: false,
          isFromWaivers: false,
          playerKey: "422.p.10234",
          transactionType: "add",
          player: expect.objectContaining({}),
        },
      ],
      isFaabRequired: true,
    };
    const addPlayerLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-04-07",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.10660": "IL",
          "422.p.106602": "BN",
          "422.p.11014": "IL+",
        },
        teamKey: "422.l.115494.t.4",
      },
    ];
    const optimizationLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-04-07",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.10234": "Util",
          "422.p.11251": "P",
          "422.p.9876": "BN",
        },
        teamKey: "422.l.115494.t.4",
      },
    ];

    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayer.json"),
    ];
    const updatedRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayer-refetched.json"),
    ];
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(updatedRosters);

    const spyFetchTopAvailablePlayers = vi.spyOn(
      TopAvailablePlayersService,
      "fetchTopAvailablePlayersFromYahoo"
    );
    const topAvailablePlayersPromise = require("./topAvailablePlayers/promises/topAvailablePlayersPromise1.json");
    const restTopAvailablePlayersPromise = require("./topAvailablePlayers/promises/restTopAvailablePlayersPromise1.json");
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      topAvailablePlayersPromise
    );
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      restTopAvailablePlayersPromise
    );

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});
    const sendPotentialTransactionEmailSpy = vi
      .spyOn(processTransactionsService, "sendPotentialTransactionEmail")
      .mockResolvedValue();

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchTopAvailablePlayers).toHaveBeenCalledTimes(2);

    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(2);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(1);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledWith(
      expect.objectContaining(transaction1),
      uid
    );

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(2);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      addPlayerLineupChanges,
      uid
    );
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      optimizationLineupChanges,
      uid
    );
    expect(sendPotentialTransactionEmailSpy).toHaveBeenCalledTimes(0);
  });

  it("should add one player by moving other to IL, then swap 3 others, and then optimize the active roster (Intraday)", async () => {
    const uid = "testUID";
    const teams = [
      {
        team_key: "422.l.119198.t.3",
        allow_dropping: true,
        allow_adding: true,
        allow_add_drops: true,
        allow_waiver_adds: true,
        game_code: "MLB",
      },
    ];

    const addPlayerLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-04-07",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.11014": "IL",
        },
        teamKey: "422.l.119198.t.3",
      },
    ];
    const optimizationLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-04-07",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.10234": "Util",
          "422.p.11251": "P",
          "422.p.9876": "BN",
        },
        teamKey: "422.l.119198.t.3",
      },
    ];

    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/free1spotILswap.json"),
    ];
    const updatedRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/free1spotILswap-refetched.json"),
    ];
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(updatedRosters);

    const spyFetchTopAvailablePlayers = vi.spyOn(
      TopAvailablePlayersService,
      "fetchTopAvailablePlayersFromYahoo"
    );
    const topAvailablePlayersPromise = require("./topAvailablePlayers/promises/topAvailablePlayersPromise2.json");
    const restTopAvailablePlayersPromise = require("./topAvailablePlayers/promises/restTopAvailablePlayersPromise2.json");
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      topAvailablePlayersPromise
    );
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      restTopAvailablePlayersPromise
    );

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchTopAvailablePlayers).toHaveBeenCalledTimes(2);

    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(2);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalled();

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(2);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      addPlayerLineupChanges,
      uid
    );
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      optimizationLineupChanges,
      uid
    );
  });

  it("should drop one player to make room for healthy on IL, post the lineup changes, then perform some swaps", async () => {
    const uid = "testUID";
    const teams = [
      {
        team_key: "422.l.115494.t.4",
        allow_dropping: true,
        allow_adding: true,
        allow_add_drops: true,
        allow_waiver_adds: true,
        game_code: "MLB",
      },
    ];

    const dropPlayerLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-06-30",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.9558": "BN",
        },
        teamKey: "422.l.115494.t.4",
      },
    ];

    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const initialRosters: ITeamOptimizer[] = [
      require("./problematicAddDrop/moveILtoBN-lineup.json"),
    ];
    const updatedRosters: ITeamOptimizer[] = [
      require("./problematicAddDrop/moveILtoBN-lineup2.json"),
    ];

    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(updatedRosters);

    const spyFetchTopAvailablePlayers = vi.spyOn(
      TopAvailablePlayersService,
      "fetchTopAvailablePlayersFromYahoo"
    );
    const topAvailablePlayersPromise = require("./problematicAddDrop/healthyOnILShouldBeIllegal-addcandidates.json");
    spyFetchTopAvailablePlayers.mockResolvedValue({});
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      topAvailablePlayersPromise
    );

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchTopAvailablePlayers).toHaveBeenCalledTimes(2);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalled();

    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      dropPlayerLineupChanges,
      uid
    );
  });

  it("should add one player and then move them to the active roster (Next Day)", async () => {
    const uid = "testUID";
    const teams = [
      {
        team_key: "422.l.115494.t.4",
        allow_adding: true,
        allow_dropping: true,
        allow_transactions: true,
        allow_add_drops: false,
        allow_waiver_adds: true,
        game_code: "MLB",
      },
    ];
    const transaction1 = {
      players: [
        {
          isInactiveList: false,
          isFromWaivers: false,
          playerKey: "422.p.10234",
          transactionType: "add",
          player: expect.objectContaining({}),
        },
      ],
      sameDayTransactions: true,
      teamKey: "422.l.115494.t.4",
      isFaabRequired: true,
    };
    const optimizationLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-04-08",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.10660": "IL",
          "422.p.106602": "BN",
          "422.p.11014": "IL+",
        },
        teamKey: "422.l.115494.t.4",
      },
    ];
    const addPlayerLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-04-08",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.10660": "IL",
          "422.p.106602": "BN",
          "422.p.11014": "IL+",
        },
        teamKey: "422.l.115494.t.4",
      },
    ];

    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayerDaily.json"),
    ];
    const tomorrowRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayerDaily-refetched.json"),
    ];
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(tomorrowRosters);

    const spyFetchTopAvailablePlayers = vi.spyOn(
      TopAvailablePlayersService,
      "fetchTopAvailablePlayersFromYahoo"
    );
    const topAvailablePlayersPromise = require("./topAvailablePlayers/promises/topAvailablePlayersPromise1.json");
    const restTopAvailablePlayersPromise = require("./topAvailablePlayers/promises/restTopAvailablePlayersPromise1.json");
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      topAvailablePlayersPromise
    );
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      restTopAvailablePlayersPromise
    );

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);
    expect(spyFetchTopAvailablePlayers).toHaveBeenCalledTimes(2);

    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(2);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(1);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledWith(
      expect.objectContaining(transaction1),
      uid
    );

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(2);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      optimizationLineupChanges,
      uid
    );
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      addPlayerLineupChanges,
      uid
    );
  });

  it("should not add anyone (but still optimize) since user setting does not allow for adds", async () => {
    const uid = "testUID";
    const teams = [
      { team_key: "422.l.115494.t.4", allow_adding: false, game_code: "MLB" },
    ];

    const optimizationLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-04-07",
        coverageType: "date",
        newPlayerPositions: {
          "422.p.10660": "IL",
          "422.p.106602": "BN",
          "422.p.11014": "BN",
          "422.p.11251": "P",
        },
        teamKey: "422.l.115494.t.4",
      },
    ];

    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayer.json"),
    ];
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);

    const spyFetchTopAvailablePlayers = vi.spyOn(
      TopAvailablePlayersService,
      "fetchTopAvailablePlayersFromYahoo"
    );

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);

    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      optimizationLineupChanges,
      uid
    );

    expect(spyFetchTopAvailablePlayers).toHaveBeenCalledTimes(0);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(0);
  });

  it("should ONLY send an email for adding a player, intraday team", async () => {
    const uid = "testUID";
    const teams = [
      { team_key: "422.l.115494.t.4", allow_adding: true, game_code: "MLB" },
    ];

    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayer-ManualTransaction.json"),
    ];
    const updatedRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayer-refetched.json"),
    ];
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(updatedRosters);

    const spyFetchTopAvailablePlayers = vi.spyOn(
      TopAvailablePlayersService,
      "fetchTopAvailablePlayersFromYahoo"
    );
    const topAvailablePlayersPromise = require("./topAvailablePlayers/promises/topAvailablePlayersPromise1.json");
    const restTopAvailablePlayersPromise = require("./topAvailablePlayers/promises/restTopAvailablePlayersPromise1.json");
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      topAvailablePlayersPromise
    );
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      restTopAvailablePlayersPromise
    );

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});
    const sendPotentialTransactionEmailSpy = vi
      .spyOn(processTransactionsService, "sendPotentialTransactionEmail")
      .mockResolvedValue();
    vi.spyOn(ScheduleSetLineupService, "isFirstRunOfTheDay").mockReturnValue(
      true
    );

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(0);
    expect(sendPotentialTransactionEmailSpy).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
  });

  it("should NOT send an email for adding a player because it is not the first run of the day", async () => {
    const uid = "testUID";
    const teams = [
      { team_key: "422.l.115494.t.4", allow_adding: true, game_code: "MLB" },
    ];

    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayer-ManualTransaction.json"),
    ];
    const updatedRosters: ITeamOptimizer[] = [
      require("./testRosters/MLB/AddBestPlayer-refetched.json"),
    ];
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce(updatedRosters);

    const spyFetchTopAvailablePlayers = vi.spyOn(
      TopAvailablePlayersService,
      "fetchTopAvailablePlayersFromYahoo"
    );
    const topAvailablePlayersPromise = require("./topAvailablePlayers/promises/topAvailablePlayersPromise1.json");
    const restTopAvailablePlayersPromise = require("./topAvailablePlayers/promises/restTopAvailablePlayersPromise1.json");
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      topAvailablePlayersPromise
    );
    spyFetchTopAvailablePlayers.mockResolvedValueOnce(
      restTopAvailablePlayersPromise
    );

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});
    const sendPotentialTransactionEmailSpy = vi
      .spyOn(processTransactionsService, "sendPotentialTransactionEmail")
      .mockResolvedValue();
    vi.spyOn(ScheduleSetLineupService, "isFirstRunOfTheDay").mockReturnValue(
      false
    );

    // Run test
    await setUsersLineup(uid, teams as ITeamFirestore[]);

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(0);
    expect(sendPotentialTransactionEmailSpy).toHaveBeenCalledTimes(0);
    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
  });
});

describe("Full stack performTransactionsForWeeklyLeagues()", () => {
  function mapFirestoreTeams(team: any): ITeamFirestore {
    return {
      uid: "testUID",
      team_key: team.team_key,
      game_code: "testGameCode",
      start_date: 1,
      end_date: Number.MAX_SAFE_INTEGER,
      weekly_deadline: "testWeeklyDeadline",
      is_subscribed: false,
      is_setting_lineups: false,
      last_updated: Date.now(),
      allow_transactions: false,
      allow_dropping: false,
      allow_adding: false,
      allow_add_drops: false,
      allow_waiver_adds: false,
      roster_positions: {},
      num_teams: 0,
    };
  }
  it("should call performTransactionsForWeeklyLeagues() for each transaction", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }].map(
      mapFirestoreTeams
    );

    const rosters = [
      require("./testRosters/NBA/WeeklyDrops/oneDropRequiredWithOptimization.json"),
      require("./testRosters/NBA/WeeklyDrops/oneDropRequiredWithOptimization.json"),
    ];

    const transaction1 = {
      players: [
        {
          playerKey: "418.p.6047",
          transactionType: "drop",
          isInactiveList: false,
          player: expect.objectContaining({}),
        },
      ],
    };
    const transaction2 = {
      players: [
        {
          playerKey: "418.p.6047",
          transactionType: "drop",
          isInactiveList: false,
          player: expect.objectContaining({}),
        },
      ],
    };

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(rosters);

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});
    const sendPotentialTransactionEmailSpy = vi
      .spyOn(processTransactionsService, "sendPotentialTransactionEmail")
      .mockResolvedValue();

    // Run test
    await performWeeklyLeagueTransactions(uid, teams);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(2);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledWith(
      expect.objectContaining(transaction1),
      uid
    );
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledWith(
      expect.objectContaining(transaction2),
      uid
    );
    expect(sendPotentialTransactionEmailSpy).toHaveBeenCalledTimes(0);
  });

  it("should send an email ONLY for one, and action for one", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }].map(
      mapFirestoreTeams
    );

    const rosters = [
      require("./testRosters/NBA/WeeklyDrops/oneDropRequiredWithOptimization-ManualTransaction.json"),
      require("./testRosters/NBA/WeeklyDrops/oneDropRequiredWithOptimization.json"),
    ];

    // Set up spies and mocks
    vi.spyOn(ScheduleSetLineupService, "isFirstRunOfTheDay").mockReturnValue(
      true
    );

    const spyFetchRostersFromYahoo = vi
      .spyOn(LineupBuilderService, "fetchRostersFromYahoo")
      .mockResolvedValue(rosters);

    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);

    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    const sendPotentialTransactionEmailSpy = vi
      .spyOn(processTransactionsService, "sendPotentialTransactionEmail")
      .mockResolvedValue();

    // Run test
    await performWeeklyLeagueTransactions(uid, teams);
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(1);
    expect(sendPotentialTransactionEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("should exit early with an empty teams array", async () => {
    const uid = "testUID";
    const teams: any[] = [];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );

    const spyPostRosterAddDropTransaction = vi.spyOn(
      yahooAPI,
      "postRosterAddDropTransaction"
    );
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    await performWeeklyLeagueTransactions(uid, teams);
    expect(spyFetchRostersFromYahoo).not.toHaveBeenCalled();
    expect(spyPostRosterAddDropTransaction).not.toHaveBeenCalled();
  });
});

describe("Test Errors thrown in LineupBuilderService by API service", () => {
  it("should throw an error from the first fetchRostersFromYahoo() API call", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockImplementationOnce(() => {
      throw new Error("Error from fetchRostersFromYahoo() test 1");
    });
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockResolvedValue();
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    expect.assertions(4);
    try {
      await setUsersLineup(uid, teams as ITeamFirestore[]);
    } catch (error) {
      expect(error).toEqual(
        new Error("Error from fetchRostersFromYahoo() test 1")
      );
    }

    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledTimes(0);
    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(0);
  });

  it("should throw an error from the fetchRostersFromYahoo() API call", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockImplementationOnce(() => {
      console.log("throwing error");
      throw new Error("Error from fetchRostersFromYahoo() test 2");
    });

    // Run test
    expect.assertions(1);
    try {
      await setUsersLineup(uid, teams as ITeamFirestore[]);
    } catch (error) {
      expect(error).toEqual(
        new Error("Error from fetchRostersFromYahoo() test 2")
      );
    }
  });

  it("should have two roster changes, and then fail to put changes", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }, { team_key: "test2" }];

    const rosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/Daily/oneSwapRequired.json"),
      require("./testRosters/NBA/Weekly/1SwapRequired1PlayerToMoveInto1EmptyRosterSpot.json"),
    ];
    const expectedRosterModifications: LineupChanges[] = [
      {
        coveragePeriod: "2023-02-28",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.6726": "BN",
          "419.p.3737": "C",
        },
        teamKey: "419.l.28340.t.1",
      },
      {
        coveragePeriod: "2023-03-08",
        coverageType: "date",
        newPlayerPositions: {
          "418.p.5295": "PF",
          "418.p.4725": "BN",
          "418.p.6021": "G",
        },
        teamKey: "418.l.201581.t.1",
      },
    ];
    const spyFetchRostersFromYahoo = vi
      .spyOn(LineupBuilderService, "fetchRostersFromYahoo")
      .mockResolvedValue(rosters);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockImplementation(() => {
        throw new Error("Error from putLineupChanges() test 3");
      });
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // test
    expect.assertions(4);
    try {
      await setUsersLineup(uid, teams as ITeamFirestore[]);
    } catch (error) {
      expect(error).toEqual(new Error("Error from putLineupChanges() test 3"));
    }
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedRosterModifications,
      uid
    );
    expect(spyPostRosterAddDropTransaction).not.toHaveBeenCalled();
    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);
  });

  it("should have one failed lineup change, then not proceed to required drops (Daily)", async () => {
    const uid = "testUID";
    const teams = [{ team_key: "test1" }];

    // Set up mock data
    const initialRosters: ITeamOptimizer[] = [
      require("./testRosters/NHL/DailyDrops/dropPlayerWithLowestScoreAndOptimization.json"),
    ];

    // we are moving the player from BN to D today, and then dropping tomorrow. No big deal.
    const expectedLineupChanges: LineupChanges[] = [
      {
        coveragePeriod: "2023-03-17",
        coverageType: "date",
        newPlayerPositions: {
          "419.p.7155": "D",
          "419.p.5703": "BN",
        },
        teamKey: "419.l.28340.t.1",
      },
    ];

    // Set up spies and mocks
    const spyFetchRostersFromYahoo = vi.spyOn(
      LineupBuilderService,
      "fetchRostersFromYahoo"
    );
    spyFetchRostersFromYahoo.mockResolvedValueOnce(initialRosters);
    spyFetchRostersFromYahoo.mockResolvedValueOnce([]);
    const spyPostRosterAddDropTransaction = vi
      .spyOn(yahooAPI, "postRosterAddDropTransaction")
      .mockResolvedValue(null);
    const spyPutLineupChanges = vi
      .spyOn(yahooAPI, "putLineupChanges")
      .mockImplementation(() => {
        throw new Error("Error from putLineupChanges() test 5");
      });
    vi.spyOn(yahooAPI, "getTopAvailablePlayers").mockResolvedValue({});

    // Run test
    expect.assertions(5);
    try {
      await setUsersLineup(uid, teams as ITeamFirestore[]);
    } catch (error) {
      expect(error).toEqual(new Error("Error from putLineupChanges() test 5"));
    }

    expect(spyFetchRostersFromYahoo).toHaveBeenCalledTimes(1);

    expect(spyPutLineupChanges).toHaveBeenCalledTimes(1);
    expect(spyPutLineupChanges).toHaveBeenCalledWith(
      expectedLineupChanges,
      uid
    );

    expect(spyPostRosterAddDropTransaction).toHaveBeenCalledTimes(0);
  });
});
