import type { QueryDocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createMock } from "../../../spec/createMock.js";
import * as firestoreService from "../../firebase/firestore.service.js";
import * as yahooAPI from "../yahooAPI.service.js";
import { fetchStartingPlayers } from "../yahooStartingPlayer.service.js";

// mock firebase-admin
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("Test setStartingPlayers()", () => {
  const intradayTeamsObject = createMock<QuerySnapshot>({
    docs: [
      createMock<QueryDocumentSnapshot>({
        id: "nhl.l.123.t.1",
        data: () => ({
          uid: "123",
          weekly_deadline: "intraday",
          game: "nhl",
        }),
      }),
    ],
    empty: false,
  });

  const startingPlayersArray = [
    "422.p.8590",
    "422.p.8780",
    "422.p.8856",
    "422.p.8918",
    "422.p.9007",
    "422.p.9124",
    "422.p.9329",
    "422.p.9334",
    "422.p.9459",
    "422.p.9640",
    "422.p.9931",
    "422.p.10141",
    "422.p.10180",
    "422.p.10592",
    "422.p.10730",
    "422.p.60002",
    "422.p.10869",
    "422.p.10903",
    "422.p.10926",
    "422.p.11202",
    "422.p.11381",
    "422.p.11428",
    "422.p.11478",
    "422.p.11480",
    "422.p.11608",
    "422.p.11750",
    "422.p.12215",
    "422.p.12281",
    "422.p.7578",
    "422.p.8180",
  ];
  const startingPlayersObject = require("./startingPlayersObject.json");

  // Create spies at module level
  const spyGetIntradayTeams = vi.spyOn(firestoreService, "getIntradayTeams");
  const spyStoreStartingPlayersInFirestore = vi.spyOn(
    firestoreService,
    "storeStartingPlayersInFirestore",
  );

  spyGetIntradayTeams.mockImplementation(() => Promise.resolve(intradayTeamsObject));
  spyStoreStartingPlayersInFirestore.mockImplementation(() => Promise.resolve());
  vi.spyOn(yahooAPI, "getStartingPlayers").mockImplementation(() =>
    Promise.resolve(startingPlayersObject),
  );

  afterEach(() => {
    // restore the spy created with spyOn
    spyGetIntradayTeams.mockClear();
    spyStoreStartingPlayersInFirestore.mockClear();
  });

  test("test NHL setStartingPlayers", async () => {
    const league = "nhl";
    await fetchStartingPlayers(league);
    expect(spyGetIntradayTeams).toHaveBeenCalledWith(league);
    expect(spyStoreStartingPlayersInFirestore).toHaveBeenCalledTimes(1);
    expect(spyStoreStartingPlayersInFirestore).toHaveBeenCalledWith(startingPlayersArray, league);
  });
  test("test MLB setStartingPlayers", async () => {
    const league = "mlb";
    await fetchStartingPlayers(league);
    expect(spyGetIntradayTeams).toHaveBeenCalledWith(league);
    expect(spyStoreStartingPlayersInFirestore).toHaveBeenCalledTimes(1);
    expect(spyStoreStartingPlayersInFirestore).toHaveBeenCalledWith(startingPlayersArray, league);
  });
  test("test NBA setStartingPlayers", async () => {
    const league = "nba";
    await fetchStartingPlayers(league);
    expect(spyGetIntradayTeams).toHaveBeenCalledWith(league);
    expect(spyStoreStartingPlayersInFirestore).not.toHaveBeenCalled();
  });
});
