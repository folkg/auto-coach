import type { TeamOptimizer } from "@common/types/team.js";
import { describe, expect, it, vi } from "vitest";
import { LineupOptimizer } from "../classes/LineupOptimizer.js";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("Test LineupOptimizer Class NFL", () => {
  it.todo("Optimal Lineup", () => {
    const roster: TeamOptimizer = require("./testRosters/NFL/optimalRoster.json");
    const lo = new LineupOptimizer(roster);
    lo.optimizeStartingLineup();
    const rosterModification = lo.lineupChanges;
    const isSuccessfullyOptimized = lo.isSuccessfullyOptimized();
    expect(isSuccessfullyOptimized).toEqual(true);

    expect(rosterModification).toEqual(null);
  });

  // *** Test Optimization of Lineup using healthy players ***
  // 1 player to move into 1 empty roster spot
  // 1 swap involving 2 players
  // different 1 swap involving 2 players
  // two swaps required
  // 1 swap required, 1 player to move into 1 empty roster spot
  // all players on bench
  // lineup with worst players on roster, best players on bench

  // *** Test Optimization of Lineup using players on Bye Week ***
  // player on roster on bye week, player on bench with high score (expect swap)
  // player on roster on bye week, player on bench with low score (expect swap)
  // two players on roster on bye week, two players on bench with low score (expect swap)
  // player on bench with bye week, empty roster spot (expect move onto roster)

  // *** Test Optimization of Lineup using some Taysom Hill cases ***
  // Player with high percent started, low rank_projected_week on bench, player with low percent started, high rank_projected_week on roster (?)
  // Player with high percent started, low rank_projected_week on bench, player with medium percent started, high rank_projected_week on roster (expect swap)
  // Player with high percent started, medium rank_projected_week on bench, player with medium percent started, high rank_projected_week on roster (?)

  // TODO: Maybe we can remove some of these redundant tests if they are thoroughly covered in NHL and NBA
  // *** Test Optimization of Lineup using injured players ***
  // high score IL player on IL, low score IL player on bench, no spare IL slot (expect swap)
  // high score IL+ player on IL+, low score IL+ player on bench, one spare IL+ slot (expect swap)
  // high score IL+ player on IL+, low score IL player on bench, no spare IL+ slot (expect swap)
  // high score IL+ player on IL+, low score IL player on bench, one spare IL and one IL+ slot (expect swap)
  // high score IL player on IL, low score IL+ player on bench, one spare IL+ slot (expect IL+ player to IL+, IL player to bench)

  // *** Test Illegal players that should be resolved ***
  // low score healthy player on IL, IL player on bench (expect swap, healthy player to BN)
  // high score healthy player on IL, IL player on bench (expect swap, healthy player to roster)
  // healthy player on IL, IL on BN, 1 empty roster spot (expect healthy player moved to BN)
  // healthy player on IL, IL+ player on BN, 1 empty IL+ slot (expect healthy player moved to BN, IL+ player to IL+)
  // healthy player on IL, IL+ player on BN, no empty IL+ slot (expect no move)
  // healthy player on IL+, IL player on BN, 1 empty IL slot (expect healthy player moved to BN, IL player to IL)
  // healthy player on IL+, IL player on BN, no empty IL slot (expect swap)
  // IL+ player on IL, no open IL+ slot (expect no move)
  // IL+ player on IL, open IL+ slot (expect IL+ player to IL+)
  // IL+ player on IL, no open IL+ slot, IL player on BN (expect swap)
  // Two healthy players on IL, one empty roster spot (expect better player to roster)
  // Two healthy player on IL, one IL player on BN (expect better player to roster, IL player to IL)
  // Two healthy players on IL, one empty roster spot, one IL player on BN (expect both healthy players to BN, IL player to IL)
  // Two healthy players on IL, two IL on BN (expect all healthy players to BN, IL players to IL)
  // Two healthy players on IL, one IL+ player on BN, one empty IL+ slot (expect better player to roster, IL+ player to IL+)
  // Two healthy players on IL, two IL+ player on BN, two empty IL+ slots (expect both healthy players to BN, IL+ players to IL+)
  // One healthy player on IL, one IL+ player on BN, one IL player on IL+, no spare IL+ slot (expect IL player to IL, IL+ player to IL+, healthy player to BN)
  // One healthy player on IL, one IL+ player on IL, one IL player on BN, one spare IL+ slot (expect IL+ player to IL+, IL player to IL, healthy player to BN)
});
