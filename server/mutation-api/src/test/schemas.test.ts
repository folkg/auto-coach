import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { HttpError, MutationTaskSchema, RateLimitStateSchema } from "../types/schemas";

describe("MutationTask Schema", () => {
  it("decodes valid mutation task", () => {
    const validTask = {
      id: "task-123",
      type: "SET_LINEUP",
      payload: { uid: "user-123", teams: [] },
      userId: "user-123",
      createdAt: new Date().toISOString(),
      status: "PENDING",
    };

    const result = Schema.decodeUnknownSync(MutationTaskSchema)(validTask);
    expect(result).toEqual(validTask);
  });

  it("rejects invalid mutation task with missing required fields", () => {
    const invalidTask = {
      id: "task-123",
      // missing type, payload, userId, createdAt, status
    };

    expect(() => {
      Schema.decodeUnknownSync(MutationTaskSchema)(invalidTask);
    }).toThrow();
  });

  it("rejects invalid status values", () => {
    const invalidTask = {
      id: "task-123",
      type: "SET_LINEUP",
      payload: { uid: "user-123", teams: [] },
      userId: "user-123",
      createdAt: new Date().toISOString(),
      status: "INVALID_STATUS",
    };

    expect(() => {
      Schema.decodeUnknownSync(MutationTaskSchema)(invalidTask);
    }).toThrow();
  });

  it("rejects invalid task type", () => {
    const invalidTask = {
      id: "task-123",
      type: "ADD_PLAYER",
      payload: { playerId: "player-456" },
      userId: "user-123",
      createdAt: new Date().toISOString(),
      status: "PENDING",
    };

    expect(() => {
      Schema.decodeUnknownSync(MutationTaskSchema)(invalidTask);
    }).toThrow();
  });
});

describe("RateLimitState Schema", () => {
  it("decodes valid rate limit state", () => {
    const validState = {
      userId: "user-123",
      count: 5,
      windowStart: new Date().toISOString(),
      windowSizeMs: 60000,
    };

    const result = Schema.decodeUnknownSync(RateLimitStateSchema)(validState);
    expect(result).toEqual(validState);
  });

  it("rejects negative count values", () => {
    const invalidState = {
      userId: "user-123",
      count: -1,
      windowStart: new Date().toISOString(),
      windowSizeMs: 60000,
    };

    expect(() => {
      Schema.decodeUnknownSync(RateLimitStateSchema)(invalidState);
    }).toThrow();
  });
});

describe("HttpError", () => {
  it("creates HttpError with correct structure", () => {
    const error = new HttpError({
      message: "Not found",
      statusCode: 404,
    });

    expect(error._tag).toBe("HttpError");
    expect(error.message).toBe("Not found");
    expect(error.statusCode).toBe(404);
  });

  it("is instance of Error", () => {
    const error = new HttpError({
      message: "Server error",
      statusCode: 500,
    });

    expect(error instanceof Error).toBe(true);
  });
});
