import { describe, expect, it } from "vitest";

import { createMock } from "./createMock.js";

type TestType = {
  name: string;
  age: number;
};

class TestClass {
  static zero = 0;

  private _property = 0;

  constructor(
    public name: string,
    public age: number,
  ) {
    TestClass.zero = 1;
  }

  set property(value: number) {
    this._property = value;
  }
  get property() {
    return this._property;
  }

  method() {
    return 0;
  }

  asyncMethod() {
    return Promise.resolve(0);
  }
}

describe("createMock", () => {
  it("returns a mock object with defined properties", () => {
    const mock = createMock<TestType>({
      name: "John",
      age: 25,
    });

    expect(mock.name).toBe("John");
    expect(mock.age).toBe(25);
  });

  it("returns a mock object for a class", () => {
    const mock = createMock<TestClass>({
      name: "John",
      age: 25,
      method: () => 1,
      property: 2,
    });

    expect(mock.name).toBe("John");
    expect(mock.age).toBe(25);
    expect(mock.method()).toBe(1);
    expect(mock.property).toBe(2);

    // Test construcor wasn't called along with static properties
    expect(TestClass.zero).toBe(0);

    // Test setter and getter
    mock.property = 3;
    expect(mock.property).toBe(3);
  });

  it("throws an error when accessing undefined properties", () => {
    const mock = createMock<TestType>({ name: "John" });

    expect(testWrapper(() => mock.name)).not.toThrow();
    expect(testWrapper(() => mock.age)).toThrowError(
      "'age' was accessed on a mock object, but the mock implementation is not defined.",
    );
  });

  it("throws an error when accessing undefined properties on a class", () => {
    const mock = createMock<TestClass>({ name: "John" });

    expect(testWrapper(() => mock.name)).not.toThrow();
    expect(testWrapper(() => mock.age)).toThrowError(
      "'age' was accessed on a mock object, but the mock implementation is not defined.",
    );
    expect(testWrapper(() => mock.method())).toThrowError(
      "'method' was accessed on a mock object, but the mock implementation is not defined.",
    );
    expect(testWrapper(() => mock.property)).toThrowError(
      "'property' was accessed on a mock object, but the mock implementation is not defined.",
    );

    // Test construcor wasn't called along with static properties
    expect(TestClass.zero).toBe(0);

    // Test setter and getter still work
    mock.property = 3;
    expect(mock.property).toBe(3);
  });

  it("returns a JSON string when calling toJSON", () => {
    const mock = createMock<TestType>({
      name: "John",
      age: 25,
    });

    // eslint-disable-next-line @typescript-eslint/quotes
    expect(JSON.stringify(mock)).toBe(`{"name":"John","age":25}`);
  });
});

/**
 * A wrapper function used to add an extra line to the stack trace in tests.
 *
 * This function is necessary because the `createMock` function throws an error
 * when a property is accessed that is not defined in the mock implementation.
 * However, this error should not be thrown when the call comes directly from a node module.
 * This function ensures the property is accessed from the test system first.
 * @param {*} testFunc
 * @return {*}
 */
function testWrapper(testFunc: () => void) {
  return () => testFunc();
}
