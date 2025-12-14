import { describe, expect, it } from "vitest";

import { TeamStandingsSchema } from "./fetchUsersTeams.service.js";

describe("TeamStandingsSchema", () => {
  it("defaults rank to null when missing from input", () => {
    // Arrange
    const input = {
      team_standings: {
        points_for: "100",
      },
    };

    // Act
    const result = TeamStandingsSchema(input);

    // Assert
    expect(result).toEqual({
      team_standings: {
        rank: null,
        points_for: "100",
      },
    });
  });

  it("preserves rank when provided as a number", () => {
    // Arrange
    const input = {
      team_standings: {
        rank: 5,
        points_for: "100",
      },
    };

    // Act
    const result = TeamStandingsSchema(input);

    // Assert
    expect(result).toEqual({
      team_standings: {
        rank: 5,
        points_for: "100",
      },
    });
  });

  it("preserves rank when provided as a string", () => {
    // Arrange
    const input = {
      team_standings: {
        rank: "3",
      },
    };

    // Act
    const result = TeamStandingsSchema(input);

    // Assert
    expect(result).toEqual({
      team_standings: {
        rank: "3",
      },
    });
  });

  it("preserves rank when explicitly null", () => {
    // Arrange
    const input = {
      team_standings: {
        rank: null,
      },
    };

    // Act
    const result = TeamStandingsSchema(input);

    // Assert
    expect(result).toEqual({
      team_standings: {
        rank: null,
      },
    });
  });
});
