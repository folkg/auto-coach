import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leagues } from "@common/types/Leagues.js";
import {
  findLeaguesPlayingNextHour,
  type GameStartTimes,
  mapUsersToActiveTeams,
  type TeamData,
} from "./scheduling.service.js";

function createMockTeamsSnapshot(
  teams: ReadonlyArray<{ readonly id: string; readonly data: TeamData }>,
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
  it("returns empty map when no teams in snapshot", () => {
    // Arrange
    const snapshot = createMockTeamsSnapshot([]);

    // Act
    const result = mapUsersToActiveTeams(snapshot);

    // Assert
    expect(result.size).toBe(0);
  });

  it("groups teams by user id", () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "team1",
        data: {
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1000,
        },
      },
      {
        id: "team2",
        data: {
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 1000,
        },
      },
      {
        id: "team3",
        data: {
          uid: "user2",
          game_code: "mlb" as Leagues,
          start_date: now - 1000,
        },
      },
    ]);

    // Act
    const result = mapUsersToActiveTeams(snapshot);

    // Assert
    expect(result.size).toBe(2);
    expect(result.get("user1")).toHaveLength(2);
    expect(result.get("user2")).toHaveLength(1);
  });

  it("adds team_key to each team from document id", () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "123.l.456.t.789",
        data: {
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1000,
        },
      },
    ]);

    // Act
    const result = mapUsersToActiveTeams(snapshot);

    // Assert
    const userTeams = result.get("user1");
    expect(userTeams?.[0]?.team_key).toBe("123.l.456.t.789");
  });

  it("excludes teams with start_date in future", () => {
    // Arrange
    const now = Date.now();
    const futureDate = now + 86400000; // tomorrow
    const snapshot = createMockTeamsSnapshot([
      {
        id: "team1",
        data: {
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: futureDate,
        },
      },
      {
        id: "team2",
        data: {
          uid: "user1",
          game_code: "nhl" as Leagues,
          start_date: now - 1000,
        },
      },
    ]);

    // Act
    const result = mapUsersToActiveTeams(snapshot);

    // Assert
    expect(result.get("user1")).toHaveLength(1);
    expect(result.get("user1")?.[0]?.game_code).toBe("nhl");
  });

  it("includes teams with start_date exactly at now", () => {
    // Arrange
    const now = Date.now();
    const snapshot = createMockTeamsSnapshot([
      {
        id: "team1",
        data: {
          uid: "user1",
          game_code: "nba" as Leagues,
          start_date: now - 1, // slightly before now to ensure it's included
        },
      },
    ]);

    // Act
    const result = mapUsersToActiveTeams(snapshot);

    // Assert
    expect(result.get("user1")).toHaveLength(1);
  });

  it("returns empty map for undefined docs array", () => {
    // Arrange
    const snapshot = {
      size: 0,
      docs: undefined,
    } as unknown as QuerySnapshot<DocumentData>;

    // Act
    const result = mapUsersToActiveTeams(snapshot);

    // Assert
    expect(result.size).toBe(0);
  });
});
