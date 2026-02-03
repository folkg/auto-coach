import type { Leagues } from "@common/types/Leagues.js";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";

import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findLeaguesPlayingNextHour,
  type FirestoreTeamPayload,
  type GameStartTimes,
  mapUsersToActiveTeams,
  MAX_DAILY_FAILURES,
  type ScheduleInfo,
} from "./scheduling.service.js";

/**
 * Creates a complete FirestoreTeamPayload with sensible defaults.
 * Override specific fields as needed for each test.
 */
function createMockTeamPayload(
  overrides: Partial<FirestoreTeamPayload> & {
    uid: string;
    game_code: Leagues;
    start_date: number;
  },
): FirestoreTeamPayload {
  return {
    team_key: "test-team-key",
    end_date: Date.now() + 86400000 * 180, // 180 days from now
    weekly_deadline: "intraday",
    roster_positions: { C: 1, LW: 2, RW: 2, D: 4, G: 2, BN: 4, IR: 2 },
    num_teams: 12,
    allow_transactions: true,
    allow_dropping: true,
    allow_adding: true,
    allow_add_drops: true,
    allow_waiver_adds: true,
    automated_transaction_processing: false,
    last_updated: -1, // default to -1 so teams are considered "not set today" by default
    is_subscribed: true,
    is_setting_lineups: true,
    lineup_failure_count: 0,
    last_lineup_failure_at: -1,
    lineup_paused_at: -1,
    ...overrides,
  };
}

function createMockTeamsSnapshot(
  teams: ReadonlyArray<{ readonly id: string; readonly data: FirestoreTeamPayload }>,
): QuerySnapshot<DocumentData> {
  const docs = teams.map((team) => ({
    id: team.id,
    data: () => team.data,
  }));

  return {
    size: docs.length,
    docs,
  } as unknown as QuerySnapshot<DocumentData>;
}

function createMockScheduleInfo(overrides?: Partial<ScheduleInfo>): ScheduleInfo {
  return {
    leagues: [
      { league: "nba" as Leagues, hasGamesToday: true, hasGameNextHour: false },
      { league: "nhl" as Leagues, hasGamesToday: true, hasGameNextHour: false },
      { league: "mlb" as Leagues, hasGamesToday: true, hasGameNextHour: false },
      { league: "nfl" as Leagues, hasGamesToday: false, hasGameNextHour: false },
    ],
    leaguesWithGamesToday: ["nba", "nhl", "mlb"] as Leagues[],
    ...overrides,
  };
}

describe("findLeaguesPlayingNextHour", () => {
  const setup = (gameStartTimes: GameStartTimes) => {
    return { gameStartTimes };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns leagues with games starting in next hour", () => {
    // Arrange
    const now = Date.now();
    const inThirtyMinutes = now + 30 * 60 * 1000;
    const { gameStartTimes } = setup({
      nba: [inThirtyMinutes],
      nhl: [],
      nfl: [],
      mlb: [],
    });

    // Act
    const result = findLeaguesPlayingNextHour(gameStartTimes);

    // Assert
    expect(result).toEqual(["nba"]);
  });

  it("returns empty array when no games starting in next hour", () => {
    // Arrange
    const now = Date.now();
    const inTwoHours = now + 2 * 60 * 60 * 1000;
    const { gameStartTimes } = setup({
      nba: [inTwoHours],
      nhl: [],
      nfl: [],
      mlb: [],
    });

    // Act
    const result = findLeaguesPlayingNextHour(gameStartTimes);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns multiple leagues with games in next hour", () => {
    // Arrange
    const now = Date.now();
    const inThirtyMinutes = now + 30 * 60 * 1000;
    const inFortyFiveMinutes = now + 45 * 60 * 1000;
    const { gameStartTimes } = setup({
      nba: [inThirtyMinutes],
      nhl: [inFortyFiveMinutes],
      nfl: [],
      mlb: [],
    });

    // Act
    const result = findLeaguesPlayingNextHour(gameStartTimes);

    // Assert
    expect(result).toContain("nba");
    expect(result).toContain("nhl");
    expect(result).toHaveLength(2);
  });

  it("excludes games that already started", () => {
    // Arrange
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    const { gameStartTimes } = setup({
      nba: [thirtyMinutesAgo],
      nhl: [],
      nfl: [],
      mlb: [],
    });

    // Act
    const result = findLeaguesPlayingNextHour(gameStartTimes);

    // Assert
    expect(result).toEqual([]);
  });

  it("includes league if any game in next hour among multiple games", () => {
    // Arrange
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    const inThirtyMinutes = now + 30 * 60 * 1000;
    const inTwoHours = now + 2 * 60 * 60 * 1000;
    const { gameStartTimes } = setup({
      nba: [thirtyMinutesAgo, inThirtyMinutes, inTwoHours],
      nhl: [],
      nfl: [],
      mlb: [],
    });

    // Act
    const result = findLeaguesPlayingNextHour(gameStartTimes);

    // Assert
    expect(result).toEqual(["nba"]);
  });

  it("excludes games exactly at one hour boundary", () => {
    // Arrange
    const now = Date.now();
    const exactlyOneHour = now + 60 * 60 * 1000;
    const { gameStartTimes } = setup({
      nba: [exactlyOneHour],
      nhl: [],
      nfl: [],
      mlb: [],
    });

    // Act
    const result = findLeaguesPlayingNextHour(gameStartTimes);

    // Assert
    expect(result).toEqual([]);
  });
});

describe("mapUsersToActiveTeams", () => {
  it("returns empty map when no teams in snapshot", async () => {
    // Arrange
    const snapshot = createMockTeamsSnapshot([]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert
    expect(result.size).toBe(0);
  });

  it("groups teams by user id", async () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "team1",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1000,
        }),
      },
      {
        id: "team2",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 1000,
        }),
      },
      {
        id: "team3",
        data: createMockTeamPayload({
          uid: "user2",
          game_code: "mlb" as Leagues,
          start_date: now - 1000,
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert
    expect(result.size).toBe(2);
    expect(result.get("user1")).toHaveLength(2);
    expect(result.get("user2")).toHaveLength(1);
  });

  it("adds team_key to each team from document id", async () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "123.l.456.t.789",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1000,
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert
    const userTeams = result.get("user1");
    expect(userTeams?.[0]?.team_key).toBe("123.l.456.t.789");
  });

  it("excludes teams with start_date in future", async () => {
    // Arrange
    const now = Date.now();
    const futureDate = now + 86400000; // tomorrow
    const snapshot = createMockTeamsSnapshot([
      {
        id: "team1",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: futureDate,
        }),
      },
      {
        id: "team2",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 1000,
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert
    expect(result.get("user1")).toHaveLength(1);
    expect(result.get("user1")?.[0]?.game_code).toBe("nhl");
  });

  it("includes teams with start_date exactly at now", async () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "team1",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1, // slightly before now to ensure it's included
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert
    expect(result.get("user1")).toHaveLength(1);
  });

  it("returns empty map for undefined docs array", async () => {
    // Arrange
    const snapshot = {
      size: 0,
      docs: undefined,
    } as unknown as QuerySnapshot<DocumentData>;
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert
    expect(result.size).toBe(0);
  });

  it("skips teams with invalid data and logs warning", async () => {
    // Arrange
    const now = Date.now();
    const invalidData = { uid: "user1" }; // Missing required fields
    const snapshot = {
      size: 2,
      docs: [
        {
          id: "invalid-team",
          data: () => invalidData,
        },
        {
          id: "valid-team",
          data: () =>
            createMockTeamPayload({
              uid: "user2",
              game_code: "nba" as Leagues,
              start_date: now - 1000,
            }),
        },
      ],
    } as unknown as QuerySnapshot<DocumentData>;
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert - should only have the valid team
    expect(result.size).toBe(1);
    expect(result.get("user2")).toHaveLength(1);
    expect(result.get("user1")).toBeUndefined();
  });

  it("excludes teams paused today", async () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "paused-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1000,
          lineup_paused_at: now - 1000, // paused today
        }),
      },
      {
        id: "active-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 1000,
          lineup_paused_at: -1, // not paused
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert
    expect(result.get("user1")).toHaveLength(1);
    expect(result.get("user1")?.[0]?.game_code).toBe("nhl");
  });

  it("excludes teams with non-matching weekly deadline", async () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "wrong-deadline-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1000,
          weekly_deadline: "5", // wrong day
        }),
      },
      {
        id: "intraday-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 1000,
          weekly_deadline: "intraday",
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert - only intraday team should be included (deadline "5" won't match today)
    expect(result.get("user1")?.some((t) => t.weekly_deadline === "intraday")).toBe(true);
  });

  it("excludes teams already set today when no game in next hour", async () => {
    // Arrange
    const now = Date.now();
    const todayEarlyMorning = now - 3600000; // 1 hour ago (still today)
    const snapshot = createMockTeamsSnapshot([
      {
        id: "already-set-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 86400000,
          last_updated: todayEarlyMorning, // set earlier today
        }),
      },
      {
        id: "not-set-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 86400000,
          last_updated: -1, // never set
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo({
      leagues: [
        { league: "nba" as Leagues, hasGamesToday: true, hasGameNextHour: false },
        { league: "nhl" as Leagues, hasGamesToday: true, hasGameNextHour: false },
      ],
    });

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert - only the not-set team should be included
    expect(result.get("user1")).toHaveLength(1);
    expect(result.get("user1")?.[0]?.game_code).toBe("nhl");
  });

  it("includes team already set today when league has game in next hour", async () => {
    // Arrange
    const now = Date.now();
    const todayEarlyMorning = now - 3600000; // 1 hour ago
    const snapshot = createMockTeamsSnapshot([
      {
        id: "already-set-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 86400000,
          last_updated: todayEarlyMorning,
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo({
      leagues: [{ league: "nba" as Leagues, hasGamesToday: true, hasGameNextHour: true }],
    });

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert - team should be included because game is in next hour
    expect(result.get("user1")).toHaveLength(1);
  });

  it("excludes teams that exceeded daily failure limit", async () => {
    // Arrange
    const now = Date.now();
    const todayEarlyMorning = now - 3600000; // 1 hour ago
    const snapshot = createMockTeamsSnapshot([
      {
        id: "failed-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 86400000,
          last_updated: -1,
          lineup_failure_count: MAX_DAILY_FAILURES,
          last_lineup_failure_at: todayEarlyMorning, // failed today
        }),
      },
      {
        id: "working-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 86400000,
          last_updated: -1,
          lineup_failure_count: 0,
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert - only working team should be included
    expect(result.get("user1")).toHaveLength(1);
    expect(result.get("user1")?.[0]?.game_code).toBe("nhl");
  });

  it("includes teams with failures from previous day", async () => {
    // Arrange
    const now = Date.now();
    const yesterday = now - 86400000 * 2; // 2 days ago
    const snapshot = createMockTeamsSnapshot([
      {
        id: "recovered-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 86400000 * 30,
          last_updated: -1,
          lineup_failure_count: MAX_DAILY_FAILURES,
          last_lineup_failure_at: yesterday, // failed yesterday, not today
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert - team should be included because failures were from a previous day
    expect(result.get("user1")).toHaveLength(1);
  });

  it("includes teams with fewer failures than limit today", async () => {
    // Arrange
    const now = Date.now();
    const todayEarlyMorning = now - 3600000;
    const snapshot = createMockTeamsSnapshot([
      {
        id: "retrying-team",
        data: createMockTeamPayload({
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 86400000,
          last_updated: -1,
          lineup_failure_count: MAX_DAILY_FAILURES - 1, // one less than limit
          last_lineup_failure_at: todayEarlyMorning,
        }),
      },
    ]);
    const scheduleInfo = createMockScheduleInfo();

    // Act
    const result = await Effect.runPromise(mapUsersToActiveTeams(snapshot, scheduleInfo));

    // Assert - team should be included because it hasn't hit the limit yet
    expect(result.get("user1")).toHaveLength(1);
  });
});
