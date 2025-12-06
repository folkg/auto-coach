/**
 * Integration tests for SchedulingService using MSW to mock external APIs.
 *
 * These tests verify the end-to-end behavior of the scheduling service
 * when interacting with Yahoo and Sportsnet APIs.
 */

import { describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";
import { HttpResponse, http } from "msw";

import {
  createYahooGame,
  createYahooGamesResponse,
  sportsnetHandlers,
  yahooHandlers,
} from "../test/msw-handlers.js";
import { server } from "../test/msw-server.js";
import { getPostponedTeamsYahoo, getTodaysGames } from "./scheduling.service.js";

// We need to re-export since the function is not exported
// For testing we'll test the public API that uses it

describe("SchedulingService Integration Tests", () => {
  describe("getTodaysGames", () => {
    it("fetches game times for all leagues from Yahoo API", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";
        const gameTime = new Date();
        gameTime.setMinutes(gameTime.getMinutes() + 30);

        server.use(
          http.get("https://api-secure.sports.yahoo.com/v1/editorial/league/nba/games*", () => {
            return HttpResponse.json(
              createYahooGamesResponse([createYahooGame({ startTime: gameTime.toISOString() })]),
            );
          }),
          http.get("https://api-secure.sports.yahoo.com/v1/editorial/league/nhl/games*", () => {
            return HttpResponse.json(
              createYahooGamesResponse([createYahooGame({ startTime: gameTime.toISOString() })]),
            );
          }),
          http.get("https://api-secure.sports.yahoo.com/v1/editorial/league/nfl/games*", () => {
            return HttpResponse.json(createYahooGamesResponse([]));
          }),
          http.get("https://api-secure.sports.yahoo.com/v1/editorial/league/mlb/games*", () => {
            return HttpResponse.json(createYahooGamesResponse([]));
          }),
        );

        // Act
        const result = yield* getTodaysGames(todayDate);

        // Assert
        expect(result.nba.length).toBe(1);
        expect(result.nhl.length).toBe(1);
        expect(result.nfl.length).toBe(0);
        expect(result.mlb.length).toBe(0);
      }).pipe(Effect.provide(mockFirestoreLayer)));

    it("falls back to Sportsnet API when Yahoo API fails", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";
        const gameTimestamp = Math.floor(Date.now() / 1000) + 1800;

        server.use(
          // Yahoo fails for nba
          yahooHandlers.error("nba", 500),
          // Sportsnet succeeds
          sportsnetHandlers.gamesAtTimes("nba", [gameTimestamp]),
          // Other leagues work normally
          yahooHandlers.noGames("nhl"),
          yahooHandlers.noGames("nfl"),
          yahooHandlers.noGames("mlb"),
        );

        // Act
        const result = yield* getTodaysGames(todayDate);

        // Assert - NBA should have games from Sportsnet fallback
        expect(result.nba.length).toBe(1);
        expect(result.nba[0]).toBe(gameTimestamp * 1000);
      }).pipe(Effect.provide(mockFirestoreLayer)));

    it("returns empty array when both APIs fail", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";

        server.use(
          yahooHandlers.error("nba", 500),
          yahooHandlers.error("nhl", 500),
          yahooHandlers.error("nfl", 500),
          yahooHandlers.error("mlb", 500),
          sportsnetHandlers.error(500),
        );

        // Act
        const result = yield* getTodaysGames(todayDate);

        // Assert
        expect(result.nba.length).toBe(0);
        expect(result.nhl.length).toBe(0);
        expect(result.nfl.length).toBe(0);
        expect(result.mlb.length).toBe(0);
      }).pipe(Effect.provide(mockFirestoreLayer)));
  });

  describe("getPostponedTeamsYahoo", () => {
    it("returns postponed team IDs from Yahoo API", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";

        server.use(
          yahooHandlers.postponedGames("nba", [
            { away: "team-1", home: "team-2" },
            { away: "team-3", home: "team-4" },
          ]),
        );

        // Act
        const result = yield* getPostponedTeamsYahoo("nba", todayDate);

        // Assert
        expect(result).toContain("team-1");
        expect(result).toContain("team-2");
        expect(result).toContain("team-3");
        expect(result).toContain("team-4");
        expect(result.length).toBe(4);
      }));

    it("returns empty array when no postponed games", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";

        server.use(
          http.get("https://api-secure.sports.yahoo.com/v1/editorial/league/nba/games*", () => {
            return HttpResponse.json(
              createYahooGamesResponse([createYahooGame({ status: "status.type.scheduled" })]),
            );
          }),
        );

        // Act
        const result = yield* getPostponedTeamsYahoo("nba", todayDate);

        // Assert
        expect(result.length).toBe(0);
      }));

    it("handles API errors gracefully", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";

        server.use(yahooHandlers.error("nba", 500));

        // Act & Assert
        const result = yield* Effect.either(getPostponedTeamsYahoo("nba", todayDate));
        expect(result._tag).toBe("Left");
      }));
  });
});

// Mock Firestore layer for tests that need database operations
import { Context, Layer } from "effect";

// Simple mock layer for Firestore schedule collection
const mockFirestoreLayer = Layer.succeed(
  Context.Tag("MockFirestore")<Context.Tag<"MockFirestore", unknown>, unknown>(),
  {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
);
