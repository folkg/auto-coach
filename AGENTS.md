# Installing Libraries

Always install the latest version of libraries via bun command line. This means that instead of picking a version manually (via updating the `package.json` file), you shall use command line to install the latest version of a library at the exact version.
The command should be run at the workspace root.

```bash
bun add @tanstack/query-core
```

## Effect Solutions Usage

The Effect Solutions CLI provides curated best practices and patterns for Effect TypeScript. Before working on Effect code, check if there's a relevant topic that covers your use case.

- `effect-solutions list` - List all available topics
- `effect-solutions show <slug...>` - Read one or more topics
- `effect-solutions search <term>` - Search topics by keyword

**Local Effect Source:** The Effect repository is cloned to `~/.local/share/effect-solutions/effect` for reference. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.

# Automated Testing

We practice Test Driven Development (TDD), this means that you should always write failing tests before you begin writing the implementation. Run the tests before you begin to ensure they run (no compliation errors), but fail for the expected reasons.

## Test Organization
- Place unit tests in the same file as the code being tested
- Test files should be named `*.test.ts` or `*.test.tsx`
- Follow the AAA (Arrange-Act-Assert) pattern. Add a code comment to describe and visually partition each section.
- Use "it" test prefixes: Test names should start with "it" followed by a clear, present-tense description of the expected behavior or outcome. For example, use `it('renders the component')` or `it('returns an error for invalid input')`. Do not use "should" in test names.
- Instead of `beforeEach()`, it is preferred to use a setup function with a return object and call that function within each test. This makes it easier to reason about the test setup when writing and debugging tests.
  - If you need to clean up the resources from a setup function, return a disposable object that contains `[Symbol.dispose](){}` or `async [Symbol.asyncDispose](){}` function as part of the return object that will clean up the resources for you. Then call the setup function with `using` in the test.
- Perfer a flat test structure without nested "describe" functions. Ensure the test names themselves are descriptive enough. If the test file already exists, follow the existing pattern.
- `test.each()` (or `it.each()`) is a good tool when only the input / out vary. Use them only when the test logic is identical and you are simply varying inputs and expected outputs. Do not use it to make tests overly clever or hard to read.

## Test Coverage
- Test both success and error cases
- Do NOT test implementation details or function internals. Use ONLY the public API to arrange, act, and assert. This means that toHaveBeenCalledWith() or other toHaveBeenCalled() should rarely, if ever, be used.
- Include edge cases and boundary conditions
- Use property-based testing where appropriate

## Test Isolation
- Use test-specific types and mocks
- Clean up resources after tests
- Avoid mocking modules, prefer dependency injection wherever possible

## Test Type Safety
- Type safety is enforced by TypeScript's type system. Do not use `any` types or cast using `as` type assertions. Type safety in test code is as important as in production code.
- Use type guards and assertions (`assert` from vitest) to ensure type safety in tests
- helper function `createMock<T>(partialObject)` from @common/utilities/createMock shall be used to create a type safe mock object with partial properties. This is very useful for creating partial mocks of service classes that you can inject or partial mocks of objects to be returned from mock functions. An example of mocking the Firestore module is below:

```ts
const mockFirestore = createMock<Firestore>({
  collection: vi.fn(() =>
    createMock<CollectionReference>({
      doc: vi.fn(() =>
        createMock<DocumentReference>({
          update: vi.fn().mockRejectedValue(new Error("Firestore error")),
        }),
      ),
    }),
  ),
});
````

## Test Container Initialization
- If the code under test is in the `services/web/imports/xm/server/**` folder and  depends on server infrastructure (e.g., Postgres, MongoDB, NATS), initialize test containers using the `initTestContainers` helper.
- Always clean up resources after tests.
- If you are cleaning up resources created in a `beforeEach` or `beforeAll` method, return the cleanup function directly in the before method instead of using a separate `afterEach` or `afterAll` method. This keeps the logic in once place.

## Testing Tools
- Use `vitest` for unit testing
- Use `TestScheduler` from `rxjs/testing` for pure RxJS Observable testing that use NO asyncronous operations. Async operations break TestScheduler.
- Use `await firstValueFrom`, `bufferCount`, `bufferTime`, and `vi.useFakeTimers()` (with associated timing methods) for RxJS Observable testing that involve asynchronous operations
- Use `react-testing-library` for React component testing

## Examples

### Good (Arrange, Act, Assert)
```typescript
// src/utils/math.ts
export function add(a: number, b: number): number {
  return a + b;
}

// src/utils/math.test.ts
import { expect, it } from "vitest";

import { add } from './math';

describe('add', () => {
  it('adds two numbers correctly', () => {
    // Arrange
    const a = 1;
    const b = 2;

    // Act
    const result = add(a, b);

    // Assert
    expect(result).toBe(3);
  });
});
```

### Bad
```typescript
// src/utils/math.test.ts
import { expect, it } from "vitest";
import { add } from './math';

describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
```

### Good (RxJS Observable Testing with only synchronous operations)
```typescript
import { TestScheduler } from "rxjs/testing";
import { assert, describe, expect, it, vi } from "vitest";

import { createMock } from "@common/utilities/createMock";
import { XenPreferences } from "../../../lib/xen/util/preferences/XenPreferences.js";
import { MockRouterService } from "../services/router/mock/MockRouterService.js";
import { DrawingBoardViewService } from "./DrawingBoardViewService.js";

const observableMatcher = (actual: unknown, expected: unknown) => {
  expect(actual).toEqual(expected);
};

describe("DrawingBoardViewService", () => {
  const setupTestDrawingBoardService = (
    enableTabs = false,
    cacheKey?: string,
    maxOpenItems = 2,
    mockRouterService = new MockRouterService(),
    mockPreferences = createMock<XenPreferences>({
      get: vi.fn().mockReturnValue("true"),
      set: vi.fn(),
    }),
  ) => {
    const service = new DrawingBoardViewService(
      enableTabs,
      cacheKey,
      maxOpenItems,
      mockRouterService,
      mockPreferences,
      [mockDrawingBoardItemPlugin],
    );

    service.start();

    return {
      service,
      [Symbol.dispose]() {
        service.stop();
      },
    };
  };

  it("promotes an item from preview to persistent", () => {
    const testScheduler = new TestScheduler(observableMatcher);
    using testService = setupTestDrawingBoardService();
    const { service } = testService;

    testScheduler.run(({ cold, expectObservable }) => {
      const currentItemSpec$ = service.currentItemSpec$;
      const previewItem$ = service.previewItem$;
      const items$ = service.items$;
      const itemNames$ = service.itemNames$;

      const source$ = cold("   --a-A--|");
      const expectedCurrent = "u-a---- ";
      const expectedPreview = "u-a-u-- ";
      const expectedItems = "  u-a---- ";

      source$.subscribe({
        next: (val) => {
          if (command === "a") {
            service.openItem(itemSpecA);
          } else if (command === "A") {
            service.persistItem(itemA);
          }
        },
        error: console.error,
      });

      expectObservable(currentItemSpec$).toBe(expectedCurrent, {
        u: undefined,
        a: itemSpecA,
      });
      expectObservable(previewItem$).toBe(expectedPreview, {
        u: undefined,
        a: itemA,
      });
      expectObservable(items$).toBe(expectedItems, {
        u: [],
        a: [itemA],
      });
      expectObservable(itemNames$).toBe(expectedItems, {
        u: new Map(),
        a: new Map([[encodeSpec(itemSpecA), encodeSpec(itemSpecA)]]),
      });
    });
  });
});
```

### Good (RxJS Observable Testing with some asynchronous operations)
```typescript
import { describe, expect, it, type Mock, vi } from "vitest";

import { ClientDataLoader } from "./clientDataLoader.js";

describe("watchOne", () => {
  it("emits updates when watcher emits new values", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue("initial");
    const dataLoader = new ClientDataLoader({
      fetchFn,
      watcher: () => alphabet$,
      gcTime: 1000,
    });

    // watchOne: () => Observable<string> - uses async operations internally
    const emissions = firstValueFrom(
      // Alternatively, can use `bufferTime` if timing is more important than item count in a test
      dataLoader.watchOne("test-key").pipe(bufferCount(4)),
    );

    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(3000);

    expect(await emissions).toEqual(["initial", "a", "b", "c"]);
    expect(fetchFn).toHaveBeenCalledWith("test-key");
  });
});
```

# Code Conventions

## If Statement Formatting

All `if` statements must use curly brackets `{}` and must not be written as single-line statements. This improves readability and reduces the risk of bugs.

```typescript
// Good
if (isActive) {
  doSomething();
}

// BAD
if (isActive) doSomething();
```

## Use `undefined` Instead of `null`

Always use `undefined` to represent missing or uninitialized values. Do not use `null` in new code. The only exception is when interacting with third-party APIs or libraries that require `null`, or when interoperating with legacy code that already uses `null`. In all other cases, prefer `undefined`.

# TypeScript Rules

## any-inside-generic-functions

When building generic functions, you may need to use any inside the function body.

This is because TypeScript often cannot match your runtime logic to the logic done inside your types.

One example:

```ts
const youSayGoodbyeISayHello = <TInput extends "hello" | "goodbye">(
  input: TInput,
): TInput extends "hello" ? "goodbye" : "hello" => {
  if (input === "goodbye") {
    return "hello"; // Error!
  } else {
    return "goodbye"; // Error!
  }
};
```

On the type level (and the runtime), this function returns `goodbye` when the input is `hello`.

There is no way to make this work concisely in TypeScript.

So using `any` is the most concise solution:

```ts
const youSayGoodbyeISayHello = <TInput extends "hello" | "goodbye">(
  input: TInput,
): TInput extends "hello" ? "goodbye" : "hello" => {
  if (input === "goodbye") {
    return "hello" as any;
  } else {
    return "goodbye" as any;
  }
};
```

Outside of generic functions, using `any` is STRICTLY FORBIDDEN. This includes test files as well.

## discriminated-unions

Proactively use discriminated unions to model data that can be in one of a few different shapes.

For example, when sending events between environments:

```ts
type UserCreatedEvent = {
  type: "user.created";
  data: { id: string; email: string };
};

type UserDeletedEvent = {
  type: "user.deleted";
  data: { id: string };
};

type Event = UserCreatedEvent | UserDeletedEvent;
```

Use switch statements to handle the results of discriminated unions:

```ts
const handleEvent = (event: Event) => {
  switch (event.type) {
    case "user.created":
      console.log(event.data.email);
      break;
    case "user.deleted":
      console.log(event.data.id);
      break;
  }
};
```

Use discriminated unions to prevent the 'bag of optionals' problem.

For example, when describing a fetching state:

```ts
// BAD - allows impossible states
type FetchingState<TData> = {
  status: "idle" | "loading" | "success" | "error";
  data?: TData;
  error?: Error;
};

// GOOD - prevents impossible states
type FetchingState<TData> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: TData }
  | { status: "error"; error: Error };
```

## switch-case-exhaustiveness

Do **not** add a `default` case to `switch` statements when handling discriminated unions or enums. We use the `@typescript-eslint/switch-exhaustiveness-check` ESLint rule, which ensures that all possible cases are handled explicitly. Adding a `default` case will prevent the linter from catching missing cases, which can lead to bugs if new variants are added in the future. Always enumerate all possible cases explicitly.

## enums

Do not introduce new enums into the codebase. Retain existing enums.

If you require enum-like behaviour, use an `as const` object:

```ts
const backendToFrontendEnum = {
  xs: "EXTRA_SMALL",
  sm: "SMALL",
  md: "MEDIUM",
} as const;

type LowerCaseEnum = keyof typeof backendToFrontendEnum; // "xs" | "sm" | "md"

type UpperCaseEnum = (typeof backendToFrontendEnum)[LowerCaseEnum]; // "EXTRA_SMALL" | "SMALL" | "MEDIUM"
```

Remember that numeric enums behave differently to string enums. Numeric enums produce a reverse mapping:

```ts
enum Direction {
  Up,
  Down,
  Left,
  Right,
}

const direction = Direction.Up; // 0
const directionName = Direction[0]; // "Up"
```

This means that the enum `Direction` above will have eight keys instead of four.

```ts
enum Direction {
  Up,
  Down,
  Left,
  Right,
}

Object.keys(Direction).length; // 8
```

## import-type

Use import type whenever you are importing a type.

Prefer top-level `import type` over inline `import { type ... }`.

```ts
// BAD
import { type User } from "./user";
```

```ts
// GOOD
import type { User } from "./user";
```

The reason for this is that in certain environments, the first version's import will not be erased. So you'll be left with:

```ts
// Before transpilation
import { type User } from "./user";

// After transpilation
import "./user";
```

## interface-extends.md

ALWAYS prefer interfaces when modelling inheritance.

The `&` operator has terrible performance in TypeScript. Only use it where `interface extends` is not possible.

```ts
// BAD

type A = {
  a: string;
};

type B = {
  b: string;
};

type C = A & B;
```

```ts
// GOOD

interface A {
  a: string;
}

interface B {
  b: string;
}

interface C extends A, B {
  // Additional properties can be added here
}
```

## jsdoc-comments

Use JSDoc comments to annotate functions and types that are exported from the file only.

Be concise in JSDoc comments, and only provide JSDoc comments if the function's behaviour is not self-evident.

Use the JSDoc inline `@link` tag to link to other functions and types within the same file.

```ts
/**
 * Subtracts two numbers
 */
const subtract = (a: number, b: number) => a - b;

/**
 * Does the opposite to {@link subtract}
 */
const add = (a: number, b: number) => a + b;
```

## no-unchecked-indexed-access

noUncheckedIndexedAccess is enabled in `tsconfig.json`, indexing into objects and arrays will behave differently from how you expect.

```ts
const obj: Record<string, string> = {};

// With noUncheckedIndexedAccess, value will
// be `string | undefined`
// Without it, value will be `string`
const value = obj.key;
```

```ts
const arr: string[] = [];

// With noUncheckedIndexedAccess, value will
// be `string | undefined`
// Without it, value will be `string`
const value = arr[0];
```

## optional-properties

Use optional properties extremely sparingly. Only use them when the property is truly optional, and consider whether bugs may be caused by a failure to pass the property.

In the example below we always want to pass user ID to `AuthOptions`. This is because if we forget to pass it somewhere in the code base, it will cause our function to be not authenticated.

```ts
// BAD
type AuthOptions = {
  userId?: string;
};

function func(options: AuthOptions) {
  const userId = options.userId;
}
```

```ts
// GOOD
type AuthOptions = {
  userId: string | undefined;
};

function func(options: AuthOptions) {
  const userId = options.userId;
}
```

## readonly-properties

Use `readonly` properties for object types by default. This will prevent accidental mutation at runtime.

Omit `readonly` only when the property is genuinely mutable.

```ts
// BAD
type User = {
  id: string;
};

const user: User = {
  id: "1",
};

user.id = "2";
```

```ts
// GOOD
type User = {
  readonly id: string;
};

const user: User = {
  id: "1",
};

user.id = "2"; // Error
```

## return-types

When declaring functions on the top-level of a module,
declare their return types. This will help future AI
assistants understand the function's purpose.

```ts
function myFunc(): string {
  return "hello";
}
```

One exception to this is components which return JSX.
No need to declare the return type of a component,
as it is always JSX.

```tsx
function MyComponent() {
  return <div>Hello</div>;
}
```

## throwing

Think carefully before implementing code that throws errors.

If a thrown error produces a desirable outcome in the system, go for it. For instance, throwing a custom error inside a backend framework's request handler.

However, for code that you would need a manual try catch for, consider using a result type instead:

```ts
type Result<T, E extends Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

For example, when parsing JSON:

```ts
const parseJson = (input: string): Result<unknown, Error> => {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
};
```

This way you can handle the error in the caller:

```ts
const result = parseJson('{"name": "John"}');

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```

## type-assertion

Use 'as' type assertions (stype casting) ONLY WHEN ABSOLUTELY NECESSARY and all other validation options have been completely exhausted (ie. type guards, type narrowing, other checks). Using 'as' essentially disables TypeScript type checking and can lead to runtime errors if the assertion is incorrect.

# RxJS Rules

All Observable variable names shall end with "$".

## Manage Subscriptions to Prevent Memory Leaks

Always unsubscribe from observables to prevent memory leaks, especially in long-lived applications or components (in React). Common patterns include:
1. Using operators like `take`, `first`, `takeUntil` (often paired with a subject that emits on component destruction).

## Choose the Right Flattening Operator

Understand and use the appropriate flattening operator (`mergeMap`, `switchMap`, `concatMap`, `exhaustMap`) based on the desired behavior when handling higher-order observables (observables that emit other observables).
* `mergeMap`: Concurrently subscribes to all inner observables. Use when order doesn't matter and concurrency is desired.
* `switchMap`: Subscribes to the latest inner observable, unsubscribing from the previous one. Ideal for scenarios like type-ahead searches where only the latest result matters.
* `concatMap`: Subscribes to inner observables sequentially, waiting for the current one to complete before subscribing to the next. Use when order is important and execution must be sequential.
* `exhaustMap`: Ignores new inner observables while the current one is still active. Useful for scenarios like preventing multiple clicks on a submit button.

## Handle Errors Gracefully

Use the `catchError` or `retry` operators within observable pipes to handle errors gracefully without terminating the entire stream. Decide whether to log the error, provide a default value, or re-throw the error (potentially wrapped). Avoid placing error handling solely in the `subscribe` block's error handler if you want the stream to continue after an error.

## Use Subjects Appropriately

Understand the different types of Subjects (`Subject`, `BehaviorSubject`, `ReplaySubject`) and use them judiciously. Subjects act as both an Observer and an Observable, enabling multicasting and bridging imperative code with the reactive world.
*   `Subject`: Basic multicasting; subscribers only get values emitted *after* they subscribe.
*   `BehaviorSubject`: Requires an initial value and emits the latest value to new subscribers. Useful for representing "current state".
*   `ReplaySubject`: Buffers a specified number of past emissions and replays them to new subscribers. Good for caching recent values.

## Understand Hot vs. Cold Observables

Understand the difference between Cold and Hot observables and their implications:
*   **Cold Observables**: Start executing or producing values only when subscribed to. Each subscription triggers a separate execution. Examples: `of()`, `from()`, `interval()`, `timer()`, most observables returned by operators. They are generally preferred for their predictable, isolated execution per subscriber.
*   **Hot Observables**: Are already producing values even before a subscription exists. Subscribers receive values emitted *after* they subscribe. Examples: Observables derived from DOM events (`fromEvent`), Subjects (`Subject`, `BehaviorSubject`, etc.). Use hot observables when dealing with shared events or state that exists independently of individual subscribers.

## Prefer Cold Observables Over Hot Observables

Cold observables are strongly preferred over hot observables wherever possible to maintain state, unless we explicitly need to call `next` in event handlers or store the state permanently to call `.value` on it. Cold observables start emitting values only when they are subscribed to, ensuring that each subscriber gets the full sequence of values from the beginning.

### Cold Observable example
```typescript
import { Observable } from 'rxjs';
import { interval } from 'rxjs';

export class ViewService {
  coldObservable$: Observable<number>;

  constructor() {
    this.coldObservable$ = interval(1000);
  }
}
```

### Hot Observable example (good)
```typescript
import { interval } from 'rxjs';
import { Value } from "../../imports/lib/rxjs/subject/Value.js";
import { switchMap, map } from 'rxjs/operators';

export class ViewService {
  hotObservable$: Value<number>;
  coldObservable$: Observable<number>;

  constructor() {
    this.hotObservable$ = new Value(0);
    this.coldObservable$ = this.hotObservable$.pipe(
      switchMap(value => interval(1000).pipe(map(interval => value * interval)))
    );
  }

  private subscriptions = new Subscription();

  start() {
    this.stop();

    this.subscriptions = new Subscription();
  }

  stop() {
    this.subscriptions.unsubscribe();
  }

  setHotObservable(value: number) {
    this.hotObservable$.next(value);
  }

  get hotObservable(): number {
    return this.hotObservable$.value;
  }
}
```

## Side Effects / Debugging

Wherever possible, prefer handling side effects by subscribing to observables directly, as this makes the intent and lifecycle of the side effect explicit. If called in a service, this means the Cold Observable could be subscribed to in a start() method, and the side effects handled there. However, if subscribing is not possible you may use the `tap` operator (formerly `do`) sparingly to perform side effects for each emission (next, error, complete) in an observable stream.

Side effects are actions that don't modify the emitted value itself but interact with the outside world, such as logging, debugging, updating external state (use cautiously), or triggering browser APIs.

## Use `share` for Caching
