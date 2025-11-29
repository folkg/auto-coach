/**
 * Creates a mock object of type T that will throw an error for any property
 * not provided in the partial object. This is useful for creating mock
 * implementations of types and interfaces for testing.
 *
 * @param {Partial<T>}partial - Optional partial object to provide mock implementations
 * @return {T} A mock object of type T.
 *
 * @example
 *
 * type MyType = {
 *   field: number;
 *   method: () => number;
 * }
 *
 * const mock = createMock<MyType>({ field: 1 });
 * console.log(mock.field); // Outputs: 1
 * console.log(mock.method()); // Throws an error
 */
export function createMock<T>(partial?: Partial<T>): T {
  const handler = {
    get: (target: T & { [key: PropertyKey]: unknown }, prop: PropertyKey) => {
      if (!(prop in target)) {
        if (IGNORED_PROPS.includes(String(prop))) {
          return undefined;
        }

        if (prop === "toJSON") {
          return JSON.stringify(target);
        }

        // If the missing proprty is being called directly from a node_module,
        // as opposed to our test system, don't throw an error since this is a
        // normal operation on a mock object during testing (e.g. from 'vitest'
        // or 'pretty-format' (from jest))
        const stackLines = new Error().stack?.split("\n");
        if (stackLines?.[3]?.includes("node_modules") === true) {
          return undefined;
        }

        throw new Error(
          `'${String(
            prop,
          )}' was accessed on a mock object, but the mock implementation is not defined.`,
        );
      }

      return target[prop];
    },
  };

  return new Proxy((partial ?? {}) as T & { [key: PropertyKey]: unknown }, handler);
}

// This allows async operations to work with the mock object
const IGNORED_PROPS = ["then", "catch", "finally"];
