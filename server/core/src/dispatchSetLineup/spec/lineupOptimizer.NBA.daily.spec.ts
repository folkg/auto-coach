import { describe, expect, it, vi } from "vitest";
import type { TeamOptimizer } from "@common/types/team.js";
import { LineupOptimizer } from "../classes/LineupOptimizer.js";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("Test LineupOptimizer Class NBA Daily", () => {
  // NBA should be very similar to NHL, so we'll just test a few things
  it("One healthy on IL, one IL on IL, one injured on roster", () => {
    const roster: TeamOptimizer = require("./testRosters/NBA/Daily/1HonIL+1ILonRoster.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);

    expect(rosterModification?.newPlayerPositions["419.p.6370"]).not.toBeDefined(); // on IR+, should not be moved

    expect(rosterModification?.newPlayerPositions["418.p.5482"]).toBeDefined();
    expect(["IL", "IL+", "BN"]).not.toContain(rosterModification?.newPlayerPositions["418.p.5482"]);
    expect(rosterModification?.newPlayerPositions["418.p.5864"]).toBeDefined();
    expect(rosterModification?.newPlayerPositions["418.p.5864"]).toEqual("IL");
  });
});
