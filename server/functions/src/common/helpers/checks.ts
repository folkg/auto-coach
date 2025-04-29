import { type ArkErrors, type } from "arktype";

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

export function hasValue(s: string | undefined | null): s is string {
  return typeof s === "string" && s.length > 0;
}

export function assertDefined<T>(
  value: T | null | undefined,
  message = "Expected value is not defined",
): asserts value is T {
  if (isDefined(value)) {
    return;
  }
  throw new Error(message);
}

export function assertTrue(
  condition: boolean,
  errorMessage = "Assertion failed",
): asserts condition {
  if (condition === false) {
    throw new Error(errorMessage);
  }
}

export function ensure<T>(
  val: T | undefined | null,
  message = "Expected value was null or undefined",
): T {
  if (val === undefined || val === null) {
    throw new TypeError(message);
  }
  return val;
}

export function isType<T>(
  data: unknown,
  schema: (data: unknown) => T | ArkErrors,
): data is T {
  const out = schema(data);
  if (out instanceof type.errors) {
    return false;
  }
  return true;
}

export function assertType<T>(
  data: unknown,
  schema: (data: unknown) => T | ArkErrors,
): asserts data is T {
  const out = schema(data);
  if (out instanceof type.errors) {
    throw new Error(out.summary);
  }
}

export function ensureType<T>(
  data: unknown,
  schema: (data: unknown) => T | ArkErrors,
): T {
  const out = schema(data);
  if (out instanceof type.errors) {
    throw new Error(out.summary);
  }
  return data as T;
}

export function ensureString(data: unknown): string {
  if (typeof data !== "string") {
    throw new Error("data is not a string");
  }
  return data;
}
