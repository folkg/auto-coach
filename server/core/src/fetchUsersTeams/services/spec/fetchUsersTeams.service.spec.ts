import { describe, expect, it, vi } from "vitest";

import * as yahooAPI from "../../../common/services/yahooAPI/yahooAPI.service.js";
import { fetchTeamsYahoo } from "../fetchUsersTeams.service.js";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("fetchUsersTeams", () => {
  it("should return a list of teams v2", async () => {
    const input = require("./input.json");

    const mockGetUserStandings = vi.spyOn(yahooAPI, "getUsersTeams");
    mockGetUserStandings.mockReturnValue(input);

    const teams = await fetchTeamsYahoo("test");
    // const fs = require("fs");
    // fs.writeFileSync(
    //   "/home/graeme/Software/auto-gm/google-cloud-auto-gm/functions/src/fetchUsersTeams/services/spec/outputv2.json",
    //   JSON.stringify(teams)
    // );

    expect(teams).toMatchSnapshot();
  });
});
