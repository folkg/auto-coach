import type { QueryDocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMock } from "@common/utilities/createMock";
import * as firestoreService from "../../common/services/firebase/firestore.service.js";
import * as utilitiesService from "../../common/services/utilities.service.js";
import { scheduleSetLineup } from "../services/scheduleSetLineup.service.js";
import * as schedulingService from "../services/scheduling.service.js";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

// Create spies at module level
const mockLeaguesToSetLineupsFor = vi.spyOn(schedulingService, "leaguesToSetLineupsFor");

const mockSetTodaysPostponedTeams = vi.spyOn(schedulingService, "setTodaysPostponedTeams");

const mockGetActiveTeamsForLeagues = vi.spyOn(firestoreService, "getActiveTeamsForLeagues");

const mockGetFunctionUrl = vi.spyOn(utilitiesService, "getFunctionUrl");
const mockGetCurrentPacificHour = vi.spyOn(utilitiesService, "getCurrentPacificHour");

const mockQueue = {
  enqueue: vi.fn(() => Promise.resolve()),
};
const mockFunctionUrl = "example";

// mock the TaskQueue constructor
vi.mock("firebase-admin/functions", () => {
  return {
    TaskQueue: vi.fn().mockImplementation(() => {
      return {
        enqueue: vi.fn(),
      };
    }),
    getFunctions: vi.fn(() => ({
      taskQueue: vi.fn(() => mockQueue),
    })),
  };
});

describe("scheduleSetLineup", () => {
  // Set implementations in beforeEach to survive mockReset
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeaguesToSetLineupsFor.mockResolvedValue(["nhl", "mlb", "nba"]);
    mockSetTodaysPostponedTeams.mockResolvedValue(undefined);
    mockGetFunctionUrl.mockResolvedValue(mockFunctionUrl);
    mockGetCurrentPacificHour.mockReturnValue(1);
  });

  function mockTeamsSnapshot(teams: { team_key: string }[]) {
    return createMock<QuerySnapshot>({
      docs: teams.map((team) =>
        createMock<QueryDocumentSnapshot>({
          id: team.team_key,
          data: () => team,
        }),
      ),
      size: teams.length,
    });
  }

  it("should enqueue tasks for each active user with playing teams", async () => {
    const teams = [
      {
        uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1",
        team_key: "419.l.14950.t.2",
        start_date: 123456789,
      },
      {
        uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1",
        team_key: "419.l.19947.t.6",
        start_date: 123456789,
      },
      {
        uid: "xAyXmaHKO3aRm9J3fnj2rgZRPnX2",
        team_key: "414.l.358976.t.4",
        start_date: 123456789,
      },
    ];

    // mock the querySnapshot object
    const teamsSnapshot = mockTeamsSnapshot(teams);

    mockGetActiveTeamsForLeagues.mockReturnValue(Promise.resolve(teamsSnapshot));

    await scheduleSetLineup();

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(2); // check if the enqueue method was called twice
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      // check if the enqueue method was called with the correct arguments for the first user
      { uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1", teams: teams.slice(0, 2) },
      {
        dispatchDeadlineSeconds: 60 * 5,
        uri: mockFunctionUrl,
      },
    );
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      // check if the enqueue method was called with the correct arguments for the second user
      { uid: "xAyXmaHKO3aRm9J3fnj2rgZRPnX2", teams: [teams[2]] },
      {
        dispatchDeadlineSeconds: 60 * 5,
        uri: mockFunctionUrl,
      },
    );
  });

  it.todo("should fetch starting players for NHL and MLB", async () => {
    const teams = [
      {
        uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1",
        team_key: "419.l.14950.t.2",
        game_code: "nhl",
        start_date: 123456789,
      },
      {
        uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1",
        team_key: "419.l.19947.t.6",
        game_code: "mlb",
        start_date: 123456789,
      },
      {
        uid: "xAyXmaHKO3aRm9J3fnj2rgZRPnX2",
        team_key: "414.l.358976.t.4",
        game_code: "nba",
        start_date: 123456789,
      },
    ];

    // mock the querySnapshot object
    const teamsSnapshot = mockTeamsSnapshot(teams);
    mockGetActiveTeamsForLeagues.mockReturnValue(Promise.resolve(teamsSnapshot));

    const spyFetchStartingPlayers = vi
      .spyOn(
        require("../../common/services/yahooAPI/yahooStartingPlayer.service"),
        "fetchStartingPlayers",
      )
      .mockImplementation(() => {
        return Promise.resolve();
      });

    await scheduleSetLineup();

    expect(spyFetchStartingPlayers).toHaveBeenCalledTimes(2);
    expect(spyFetchStartingPlayers).toHaveBeenCalledWith("nhl");
    expect(spyFetchStartingPlayers).toHaveBeenCalledWith("mlb");
  });

  it("should only enqueue tasks with a start date in the past", async () => {
    const teams = [
      {
        uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1",
        team_key: "419.l.14950.t.2",
        start_date: Date.now() + 10000,
      },
      {
        uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1",
        team_key: "419.l.19947.t.6",
        start_date: 123456789,
      },
      {
        uid: "xAyXmaHKO3aRm9J3fnj2rgZRPnX2",
        team_key: "414.l.358976.t.4",
        start_date: Date.now() + 10000,
      },
    ];

    // mock the querySnapshot object
    const teamsSnapshot = mockTeamsSnapshot(teams);

    mockGetActiveTeamsForLeagues.mockReturnValue(Promise.resolve(teamsSnapshot));

    await scheduleSetLineup();

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1); // check if the enqueue method was called twice
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      // check if the enqueue method was called with the correct arguments for the first user
      { uid: "RLSrRcWN3lcYbxKQU1FKqditGDu1", teams: [teams[1]] },
      {
        dispatchDeadlineSeconds: 60 * 5,
        uri: mockFunctionUrl,
      },
    );
  });

  it("should not execute if there are no leagues", async () => {
    mockLeaguesToSetLineupsFor.mockReturnValue(Promise.resolve([]));
    const logSpy = vi.spyOn(logger, "log");

    await scheduleSetLineup();

    expect(logSpy).toHaveBeenCalledWith("No leagues to set lineups for.");
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  it("should not execute if there are no active users / teams", async () => {
    mockGetActiveTeamsForLeagues.mockResolvedValue(
      createMock<QuerySnapshot>({ docs: [], size: 0 }),
    );
    const logSpy = vi.spyOn(logger, "log");

    await scheduleSetLineup();

    expect(logSpy).toHaveBeenCalledWith("No users to set lineups for");
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });
});
