import { describe, expect, it } from "vitest";

import { LeagueDetailsSchema } from "./yahooTeamProcesssing.services.js";

describe("LeagueDetailsSchema", () => {
  it("accepts and preserves string edit_key", () => {
    // Arrange
    const input = {
      edit_key: "2023-04-14",
      name: "Test League",
      num_teams: 12,
      start_date: "2023-04-01",
      end_date: "2023-10-01",
      weekly_deadline: "Monday",
      scoring_type: "head",
    };

    // Act
    const result = LeagueDetailsSchema.assert(input);

    // Assert
    expect(result.edit_key).toBe("2023-04-14");
    expect(typeof result.edit_key).toBe("string");
  });

  it("accepts numeric edit_key and converts to string", () => {
    // Arrange
    const input = {
      edit_key: 20231214,
      name: "Test League",
      num_teams: 12,
      start_date: "2023-04-01",
      end_date: "2023-10-01",
      weekly_deadline: "Monday",
      scoring_type: "head",
    };

    // Act
    const result = LeagueDetailsSchema.assert(input);

    // Assert
    expect(result.edit_key).toBe("20231214");
    expect(typeof result.edit_key).toBe("string");
  });
});
