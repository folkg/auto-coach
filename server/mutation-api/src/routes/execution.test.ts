import { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";

import {
  DomainError,
  RateLimitError,
  ServiceUnavailableError,
  SystemError,
} from "../types/api-schemas";
import { createExecutionRoutes, errorToResponse } from "./execution";

// Validation only; avoids executing downstream Firestore logic.

// Minimal Firestore stub if needed (can pass real, tests won't reach usage for invalid case)
const firestore = new Firestore();

describe("errorToResponse", () => {
  const defaultRetryAfterSeconds = 60;

  it("returns 429 with retryAfter for RateLimitError", () => {
    // Arrange
    const error = new RateLimitError({
      message: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: 120,
    });

    // Act
    const result = errorToResponse(error, defaultRetryAfterSeconds);

    // Assert
    expect(result.statusCode).toBe(429);
    expect(result.retryAfter).toBe(120);
    expect(result.response.retryAfter).toBe(120);
    expect(result.response.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("returns 429 with default retryAfter when not provided by Yahoo", () => {
    // Arrange
    const error = new RateLimitError({
      message: "Rate limit exceeded",
      code: "RATE_LIMIT",
    });

    // Act
    const result = errorToResponse(error, defaultRetryAfterSeconds);

    // Assert
    expect(result.statusCode).toBe(429);
    expect(result.retryAfter).toBe(60);
    expect(result.response.retryAfter).toBe(60);
  });

  it("returns 400 for DomainError with no retryAfter", () => {
    // Arrange
    const error = new DomainError({
      message: "Invalid payload",
      code: "INVALID_PAYLOAD",
    });

    // Act
    const result = errorToResponse(error, defaultRetryAfterSeconds);

    // Assert
    expect(result.statusCode).toBe(400);
    expect(result.retryAfter).toBeUndefined();
    expect(result.response.code).toBe("INVALID_PAYLOAD");
  });

  it("returns 500 for SystemError with no retryAfter", () => {
    // Arrange
    const error = new SystemError({
      message: "Internal error",
      code: "INTERNAL_ERROR",
      retryable: true,
    });

    // Act
    const result = errorToResponse(error, defaultRetryAfterSeconds);

    // Assert
    expect(result.statusCode).toBe(500);
    expect(result.retryAfter).toBeUndefined();
    expect(result.response.code).toBe("INTERNAL_ERROR");
  });

  it("returns 503 with retryAfter for ServiceUnavailableError", () => {
    // Arrange
    const error = new ServiceUnavailableError({
      message: "Yahoo API in maintenance mode",
      code: "YAHOO_MAINTENANCE",
      retryAfter: 8 * 60,
    });

    // Act
    const result = errorToResponse(error, defaultRetryAfterSeconds);

    // Assert
    expect(result.statusCode).toBe(503);
    expect(result.retryAfter).toBe(480);
    expect(result.response.retryAfter).toBe(480);
    expect(result.response.code).toBe("YAHOO_MAINTENANCE");
  });

  it("returns 503 for circuit breaker open errors", () => {
    // Arrange
    const error = new ServiceUnavailableError({
      message: "Circuit breaker is open",
      code: "CIRCUIT_BREAKER_OPEN",
      retryAfter: 5 * 60,
    });

    // Act
    const result = errorToResponse(error, defaultRetryAfterSeconds);

    // Assert
    expect(result.statusCode).toBe(503);
    expect(result.retryAfter).toBe(300);
    expect(result.response.code).toBe("CIRCUIT_BREAKER_OPEN");
  });
});

describe("createExecutionRoutes", () => {
  it("returns validation error when task field missing in /mutation", async () => {
    // Arrange
    const app = createExecutionRoutes(firestore);
    const body = {
      // task omitted
    };

    // Act
    const res = await app.fetch(
      new Request("http://test/mutation", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Assert
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: unknown[] };
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });
});
