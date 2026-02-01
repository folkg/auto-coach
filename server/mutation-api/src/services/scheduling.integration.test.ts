/**
 * Integration tests for SchedulingService using MSW to mock external APIs.
 *
 * These tests verify the end-to-end behavior of the scheduling service
 * when interacting with Yahoo Graphite and Sportsnet APIs.
 */

import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";
import { HttpResponse, http } from "msw";

import {
  createSportsnetTickerGame,
  createSportsnetTickerResponse,
  createYahooGraphiteGame,
  createYahooLeagueGamesResponse,
  sportsnetHandlers,
  yahooHandlers,
} from "../test/msw-handlers.js";
import { server } from "../test/msw-server.js";
import { getPostponedTeamsYahoo, getTodaysGames } from "./scheduling.service.js";

describe("SchedulingService Integration Tests", () => {
  afterEach(() => {
    yahooHandlers.clearPostponedState();
  });

  describe("getTodaysGames", () => {
    it("fetches game times for all leagues from Yahoo Graphite API", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";
        const gameTime = new Date();
        gameTime.setMinutes(gameTime.getMinutes() + 30);

        server.use(
          http.get(
            "https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate*",
            ({ request }) => {
              const leaguesMatch = request.url.match(/leagues=([^&]+)/);
              const league = leaguesMatch?.[1];

              if (league === "nba" || league === "nhl") {
                return HttpResponse.json(
                  createYahooLeagueGamesResponse([
                    createYahooGraphiteGame({ startTime: gameTime.toISOString() }),
                  ]),
                );
              }
              return HttpResponse.json(createYahooLeagueGamesResponse([]));
            },
          ),
        );

        // Act
        const result = yield* getTodaysGames(todayDate);

        // Assert
        expect(result.nba.length).toBe(1);
        expect(result.nhl.length).toBe(1);
        expect(result.nfl.length).toBe(0);
        expect(result.mlb.length).toBe(0);
      }).pipe(Effect.provide(mockFirestoreLayer)));

    it("falls back to Sportsnet ticker API when Yahoo API fails", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";
        const gameTimestamp = Math.floor(Date.now() / 1000) + 1800;

        server.use(
          // Yahoo fails for nba
          yahooHandlers.error("nba", 500),
          // Sportsnet ticker succeeds
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

    it("falls back to Sportsnet ticker API when Yahoo returns 404", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";
        const gameTimestamp = Math.floor(Date.now() / 1000) + 1800;

        server.use(
          // Yahoo returns 404 for nhl (simulating the endpoint move)
          yahooHandlers.error("nhl", 404),
          // Sportsnet ticker succeeds
          http.get("https://stats-api.sportsnet.ca/ticker*", () => {
            return HttpResponse.json(
              createSportsnetTickerResponse([
                createSportsnetTickerGame({ timestamp: gameTimestamp }),
              ]),
            );
          }),
          // Other leagues work normally
          yahooHandlers.noGames("nba"),
          yahooHandlers.noGames("nfl"),
          yahooHandlers.noGames("mlb"),
        );

        // Act
        const result = yield* getTodaysGames(todayDate);

        // Assert - NHL should have games from Sportsnet fallback after Yahoo 404
        expect(result.nhl.length).toBe(1);
        expect(result.nhl[0]).toBe(gameTimestamp * 1000);
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
    it("returns postponed team IDs from Yahoo Graphite API", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";

        server.use(
          yahooHandlers.postponedGames("nba", [
            { away: "nba.t.1", home: "nba.t.2" },
            { away: "nba.t.3", home: "nba.t.4" },
          ]),
          yahooHandlers.scoreboardGameForPostponed(),
        );

        // Act
        const result = yield* getPostponedTeamsYahoo("nba", todayDate);

        // Assert
        expect(result).toContain("nba.t.1");
        expect(result).toContain("nba.t.2");
        expect(result).toContain("nba.t.3");
        expect(result).toContain("nba.t.4");
        expect(result.length).toBe(4);
      }));

    it("returns empty array when no postponed games", () =>
      Effect.gen(function* () {
        // Arrange
        const todayDate = "2024-01-15";

        server.use(
          http.get(
            "https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate*",
            () => {
              return HttpResponse.json(
                createYahooLeagueGamesResponse([createYahooGraphiteGame({ status: "PREGAME" })]),
              );
            },
          ),
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
