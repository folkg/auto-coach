import { assert, describe, expect, it, vi } from "vitest";

import { RevokedRefreshTokenError } from "../errors.js";
import { loadYahooAccessToken } from "../firestore.service.js";

// Mock the necessary dependencies
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            refreshToken: "-1",
          }),
        }),
      })),
    })),
    settings: vi.fn(),
  })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("loadYahooAccessToken", () => {
  it('should throw RevokedRefreshTokenError when refresh token is "-1"', async () => {
    try {
      await loadYahooAccessToken("123"); // Replace '123' with the actual user ID
      assert(false, "Expected RevokedRefreshTokenError to be thrown.");
    } catch (error) {
      assert(error instanceof RevokedRefreshTokenError);
      expect(error.message).toEqual(
        "RevokedRefreshTokenError: User 123 has revoked access. Stopping all actions for this user.",
      );
    }
  });
});
