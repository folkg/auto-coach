import { describe, expect, it, vi } from "vitest";
import {
  type AngularTeam,
  yahooToFirestore,
} from "../../../interfaces/Team.js";

vi.mock("firebase-admin/firestore", () => {
  return {
    getFirestore: vi.fn(),
  };
});
vi.mock("firebase-admin/app", () => {
  return {
    getApps: vi.fn(() => ["null"]),
    initializeApp: vi.fn(),
  };
});

describe("clientToFirestore", () => {
  const mockTeam: AngularTeam = {
    uid: "test_uid",
    game_name: "game name",
    game_code: "nhl",
    game_season: "game season",
    game_is_over: false,
    team_key: "team key",
    team_name: "team name",
    team_url: "team URL",
    team_logo: "team logo",
    league_name: "league name",
    num_teams: 12,
    rank: "1st",
    points_for: 100,
    points_against: 50,
    points_back: 10,
    outcome_totals: {
      wins: 3,
      losses: 2,
      ties: 0,
      percentage: "60%",
    },
    roster_positions: {
      LW: 2,
      C: 2,
      RW: 2,
    },
    scoring_type: "scoring type",
    start_date: 1680418800000, //  Sunday April 02, 2023 14:02:47 GMT-0700 (Pacific Daylight Time)
    end_date: 1680850799999, //  Thursday April 06, 2023 14:02:47 GMT-0700 (Pacific Daylight Time)
    weekly_deadline: "Sun 4:15pm ET",
    waiver_rule: "waiver rule",
    edit_key: "edit key",
    faab_balance: 100,
    current_weekly_adds: 2,
    current_season_adds: 25,
    max_weekly_adds: 3,
    max_season_adds: 50,
    max_games_played: 162,
    max_innings_pitched: 1400,
  };

  const expectedOutput = {
    uid: mockTeam.uid,
    is_subscribed: true,
    is_setting_lineups: false,
    last_updated: -1,
    lineup_paused_at: -1,
    num_teams: 12,
    roster_positions: {
      LW: 2,
      C: 2,
      RW: 2,
    },
    game_code: mockTeam.game_code,
    team_key: mockTeam.team_key,
    start_date: mockTeam.start_date,
    end_date: mockTeam.end_date,
    weekly_deadline: mockTeam.weekly_deadline,
    allow_dropping: false,
    allow_adding: false,
    allow_add_drops: false,
    allow_transactions: false,
    allow_waiver_adds: false,
    automated_transaction_processing: false,
  };

  it("should convert a teamclient object to a teamFirestore object", () => {
    expect(yahooToFirestore(mockTeam, "test_uid")).toEqual(expectedOutput);
  });
});
