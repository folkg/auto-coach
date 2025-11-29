import type { DocumentData, QueryDocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as firestoreService from "../../common/services/firebase/firestore.service.js";
import { createMock } from "../../common/spec/createMock.js";
import { scheduleWeeklyLeagueTransactions } from "../services/scheduleWeeklyLeagueTansactions.service.js";

// mock firebase-admin
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

const mockQueue = {
  enqueue: vi.fn(() => Promise.resolve()),
};
const mockFunctionUrl = vi.fn(() => Promise.resolve("https://example.com"));
vi.mock("../../common/services/utilities.service", () => ({
  getFunctionUrl: vi.fn(() => mockFunctionUrl),
}));

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

describe("scheduleWeeklyLeagueTransactions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockGetActiveWeeklyTeams = vi.spyOn(firestoreService, "getTomorrowsActiveWeeklyTeams");

  function mockTeamsSnapshot(teams: { uid: string; team_key: string; start_date: number }[]) {
    return createMock<QuerySnapshot<DocumentData>>({
      size: teams.length,
      docs: teams.map((team) =>
        createMock<QueryDocumentSnapshot>({
          id: team.team_key,
          data: () => team,
        }),
      ),
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

    mockGetActiveWeeklyTeams.mockReturnValue(Promise.resolve(teamsSnapshot));

    await scheduleWeeklyLeagueTransactions();

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

  it("should not execute if there are no active users / teams", async () => {
    mockGetActiveWeeklyTeams.mockReturnValue(
      Promise.resolve({ docs: [] } as unknown as QuerySnapshot<DocumentData>),
    );
    const logSpy = vi.spyOn(logger, "log");

    await scheduleWeeklyLeagueTransactions();

    expect(logSpy).toHaveBeenCalledWith("No users to set lineups for");
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });
});
