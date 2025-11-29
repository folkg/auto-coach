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

export function isType<T>(data: unknown, schema: (data: unknown) => T | ArkErrors): data is T {
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

export function ensureType<T>(data: unknown, schema: (data: unknown) => T | ArkErrors): T {
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

export function deepEqual<T>(value1: T, value2: T): boolean {
  // Check for strict equality (handles primitives and reference equality)
  if (value1 === value2) {
    return true;
  }

  // Handle cases where either value is null or undefined
  if (!(isDefined(value1) && isDefined(value2))) {
    return false;
  }

  // Check if both values are objects (including arrays)
  if (typeof value1 === "object" && typeof value2 === "object") {
    // Handle arrays
    if (Array.isArray(value1) && Array.isArray(value2)) {
      if (value1.length !== value2.length) {
        return false;
      }
      return value1.every((item, index) => deepEqual(item, value2[index]));
    }

    // Handle non-array objects
    if (!(Array.isArray(value1) || Array.isArray(value2))) {
      const keys1 = Object.keys(value1 as object);
      const keys2 = Object.keys(value2 as object);

      // Check if both objects have the same number of keys
      if (keys1.length !== keys2.length) {
        return false;
      }

      // Check if all keys and their values are equal
      return keys1.every((key) => {
        const val1 = (value1 as Record<string, unknown>)[key];
        const val2 = (value2 as Record<string, unknown>)[key];
        return deepEqual(val1, val2);
      });
    }
  }

  // If none of the above conditions match, the values are not equal
  return false;
}
