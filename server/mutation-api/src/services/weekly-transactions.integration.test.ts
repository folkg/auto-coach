/**
 * Integration tests for WeeklyTransactionsService.
 *
 * These tests verify the end-to-end weekly transaction scheduling
 * and execution flows.
 *
 * Note: These tests use dependency injection patterns rather than vi.mock
 * to avoid polluting module state for other tests.
 */

import type { FirestoreTeam } from "@common/types/team.js";

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { performWeeklyLeagueTransactions } from "./weekly-transactions.service.js";

describe("WeeklyTransactionsService Integration Tests", () => {
  describe("performWeeklyLeagueTransactions", () => {
    it("fails when no uid provided", () =>
      Effect.gen(function* () {
        // Arrange
        const teams: readonly FirestoreTeam[] = [];

        // Act
        const result = yield* Effect.either(performWeeklyLeagueTransactions("", teams));

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.message).toContain("No uid provided");
        }
      }));

    it("fails when no teams provided", () =>
      Effect.gen(function* () {
        // Act
        const result = yield* Effect.either(
          performWeeklyLeagueTransactions(
            "test-user",
            undefined as unknown as readonly FirestoreTeam[],
          ),
        );

        // Assert
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.message).toContain("No teams provided");
        }
      }));

    it("completes successfully when empty teams array provided", () =>
      Effect.gen(function* () {
        // Arrange
        const teams: readonly FirestoreTeam[] = [];

        // Act - empty teams should return early without error
        yield* performWeeklyLeagueTransactions("test-user", teams);

        // Assert - should complete without error
        expect(true).toBe(true);
      }));
  });
});
