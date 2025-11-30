# Oxlint Migration Todo

Goal: migrate `.oxlintrc.json` from the current config to the stricter target config provided, by enabling one rule (or small closely related group) at a time. 

---

## Core JS correctness & safety rules

### [ ] Enable `for-direction`

- Prevent `for` loops whose update expression never progresses toward the exit condition (potential infinite loops).
- Fixes:
  - Ensure `i++` pairs with `i < limit` and `i--` with `i >= 0` (or similar consistent comparisons).
  - Prefer `for (const item of array)` when index math is unnecessary.

### [ ] Enable `getter-return`

- Ensure getters always return a value or explicitly throw.
- Fixes:
  - Add `return` in all code paths of getters, or throw in error paths.
  - Convert complex getters into regular methods if side‑effects dominate.

### [ ] Enable `no-async-promise-executor`

- Forbid `new Promise(async (resolve, reject) => { ... })` which can swallow errors.
- Fixes:
  - Replace with `async` functions: `async function doThing() { ... }` and use them directly.
  - If a `Promise` constructor is required, move async logic outside and call it from a non‑async executor.

### [ ] Enable `no-case-declarations`

- Disallow lexical declarations (`let`, `const`, `function`, `class`) directly in `case` clauses without a block.
- Fixes:
  - Wrap `case` bodies needing declarations in `{ ... }` blocks.
  - Or hoist declarations above the switch and assign inside cases.

### [ ] Enable `no-class-assign`

- Prevent reassigning class identifiers (`Foo = other;`).
- Fixes:
  - Use separate variables or factory functions instead of mutating class bindings.

### [ ] Enable `no-compare-neg-zero`

- Forbid `x === -0` / `x !== -0`; -0 has edge semantics in JS.
- Fixes:
  - Use `Object.is(x, -0)` when you truly need to detect -0.
  - Otherwise, treat -0 as 0 and avoid special‑casing.

### [ ] Enable `no-cond-assign`

- Disallow assignments in conditionals that are likely typos (`if (x = y)`).
- Fixes:
  - Use `===`/`!==` for comparisons.
  - If intentional, separate assignment from condition in its own statement.

### [ ] Enable `no-const-assign`

- Prevent reassigning `const` variables.
- Fixes:
  - Change the declaration to `let` if mutation is truly required.
  - Prefer immutable patterns: create new variables instead of mutating.

### [ ] Enable `no-constant-binary-expression`

- Flag binary expressions that are always constant (e.g., `x === x`, `1 + 2 === 3`).
- Fixes:
  - Remove dead comparisons or replace with intended variable checks.

### [ ] Enable `no-constant-condition`

- Forbid conditions that are always truthy/falsey (except intentional `while(true)` patterns, which may still be flagged).
- Fixes:
  - Replace `if (true)` / `if (0)` etc. with the intended condition.
  - For intentional infinite loops, consider `for (;;)` and/or disable rule locally with comments (sparingly).

### [ ] Enable `no-control-regex`

- Disallow control characters in regular expressions which are usually mistakes.
- Fixes:
  - Use escaped forms (`\xNN`) or remove control characters.

### [ ] Enable `no-debugger`

- Forbid `debugger` statements.
- Fixes:
  - Remove `debugger` or gate them behind `if (process.env.NODE_ENV !== 'production') {}` and then delete before shipping.

### [ ] Enable `no-delete-var`

- Prevent `delete` on variables; only properties should be deleted.
- Fixes:
  - Use `delete obj.prop` instead of `delete variable`.
  - For local vars, set to `undefined` or restructure logic.

### [ ] Enable `no-dupe-class-members`

- Disallow duplicate method names in classes.
- Fixes:
  - Merge implementations or rename one of the methods.

### [ ] Enable `no-dupe-else-if`

- Catch duplicated `else if` conditions which are dead code.
- Fixes:
  - Consolidate duplicated branches, or fix the intended differing condition.

### [ ] Enable `no-dupe-keys`

- Forbid duplicate keys in object literals.
- Fixes:
  - Remove or rename duplicates; ensure a single authoritative definition.

### [ ] Enable `no-duplicate-case`

- Disallow multiple `case` clauses with the same value.
- Fixes:
  - Merge duplicate cases or correct copy‑paste errors.

### [ ] Keep `no-empty` enabled (already on)

- Rule exists and is already `error`; ensure it matches target semantics.
- Strategies already in effect; no extra work beyond fixing any new violations when other changes expose more files.

### [ ] Enable `no-empty-character-class`

- Disallow regexes like `/[]/` which always fail.
- Fixes:
  - Add the intended characters or remove the character class.

### [ ] Enable `no-empty-pattern`

- Prevent destructuring patterns with no bindings.
- Fixes:
  - Remove useless destructuring or bind the needed properties.

### [ ] Enable `no-empty-static-block`

- Forbid empty `static {}` blocks in classes.
- Fixes:
  - Remove empty blocks or add meaningful logic.

### [ ] Enable `no-ex-assign`

- Disallow reassigning `catch (e)` parameters.
- Fixes:
  - Use a new variable if you need to transform the error.
  - Prefer immutable error handling: compute derived values in separate vars.

### [ ] Enable `no-extra-boolean-cast`

- Disallow redundant `!!` or `Boolean()` where not needed.
- Fixes:
  - Remove double negations in conditions already expecting booleans.
  - Keep `!!` only where you need explicit casting (e.g., returning a boolean API).

### [ ] Enable `no-fallthrough`

- Warn on switch cases that fall through without `break`/`return`/`throw`.
- Fixes:
  - Add `break`, `return`, or `throw` at the end of each case.
  - If intentional fallthrough, use explicit comments/structure and consider refactoring to clearer control flow.

### [ ] Enable `no-func-assign`

- Prevent reassigning function declarations.
- Fixes:
  - Use separate variables or wrap in an object if you need to vary behavior.

### [ ] Enable `no-global-assign`

- Disallow assignments to read‑only globals (e.g., `window = {}` in browsers).
- Fixes:
  - Mutate allowed properties instead of reassigning globals.

### [ ] Enable `no-import-assign`

- Prevent reassigning imported bindings (`foo = 1` after `import { foo }`).
- Fixes:
  - Use local variables for derived values; keep imports as read‑only.

### [ ] Enable `no-invalid-regexp`

- Catch invalid regex patterns at lint time.
- Fixes:
  - Correct pattern syntax or test regex separately before committing.

### [ ] Enable `no-irregular-whitespace`

- Forbid non‑standard whitespace characters in source (e.g., non‑breaking spaces).
- Fixes:
  - Replace odd whitespace with regular spaces/newlines.
  - Configure editor to highlight or strip non‑ASCII whitespace.

### [ ] Enable `no-loss-of-precision`

- Prevent numeric literals that cannot be represented exactly (e.g., overly long decimals).
- Fixes:
  - Use `BigInt` or strings for high‑precision values.
  - Round to a representable number where appropriate.

### [ ] Enable `no-new-native-nonconstructor`

- Forbid `new` with non‑constructor built‑ins (e.g., `new Math()`).
- Fixes:
  - Call such APIs as functions or use alternative constructors.

### [ ] Enable `no-nonoctal-decimal-escape`

- Disallow `\8` / `\9` style escapes in strings/regex.
- Fixes:
  - Use hex or unicode escapes (`\xNN`, `\uNNNN`).

### [ ] Enable `no-obj-calls`

- Prevent calling global objects as functions (e.g., `Math()`).
- Fixes:
  - Use the correct API (`Math.random()`, not `Math()`).

### [ ] Enable `no-prototype-builtins`

- Avoid calling `obj.hasOwnProperty` directly which can be overridden.
- Fixes:
  - Use `Object.hasOwn(obj, key)` or `Object.prototype.hasOwnProperty.call(obj, key)`.

### [ ] Enable `no-redeclare`

- Disallow redeclaring variables in the same scope.
- Fixes:
  - Rename variables or consolidate declarations.

### [ ] Enable `no-regex-spaces`

- Forbid multiple literal spaces in regex patterns.
- Fixes:
  - Use quantifiers (` {2}`) or escapes where appropriate.

### [ ] Enable `no-self-assign`

- Disallow `x = x` and similar self assignments.
- Fixes:
  - Remove no‑op assignments; they usually signal a bug or leftover debug code.

### [ ] Enable `no-setter-return`

- Forbid returning values from setters.
- Fixes:
  - Remove `return` statements or convert setters to regular methods.

### [ ] Enable `no-shadow-restricted-names`

- Prevent shadowing reserved names (`undefined`, `NaN`, etc.).
- Fixes:
  - Rename local variables to safer names.

### [ ] Enable `no-sparse-arrays`

- Disallow arrays with holes (`[1, , 3]`).
- Fixes:
  - Use `undefined` explicitly or refactor to objects/maps as appropriate.

### [ ] Enable `no-this-before-super`

- Enforce calling `super()` before using `this` in subclass constructors.
- Fixes:
  - Move `super()` to the first line of the constructor before any `this` usage.

### [ ] Enable `no-undef`

- Disallow use of undeclared variables.
- Fixes:
  - Add appropriate declarations or imports.
  - Correct typos or use `globalThis` where a true global is intended.

### [ ] Add explicit `no-unexpected-multiline` configuration (off)

- Configure `"no-unexpected-multiline": "off"` to mirror target; no code changes expected.

### [ ] Enable `no-unreachable`

- Catch code after `return`, `throw`, `continue`, or `break`.
- Fixes:
  - Remove unreachable code or move logic before the terminating statement.

### [ ] Enable `no-unsafe-finally`

- Prevent `return`, `throw`, `break`, or `continue` inside `finally` that override try/catch behavior.
- Fixes:
  - Move returns/throws outside `finally` or restructure to avoid overriding.

### [ ] Enable `no-unsafe-negation`

- Disallow `!` applied directly to relational operators in a confusing way.
- Fixes:
  - Rewrite `!(a in b)` as `!(a in b)` with parentheses or use clearer comparisons.

### [ ] Enable `no-unsafe-optional-chaining`

- Forbid unsafe optional chaining like `foo?.bar()` when `foo` might be `null` but `bar` isn’t a function, or using it on non‑optional receivers.
- Fixes:
  - Add nullish checks or default values.
  - Avoid mixing optional chaining with non‑null assertions; use safe narrowing instead.

### [ ] Enable `no-unused-labels`

- Disallow unused statement labels.
- Fixes:
  - Remove labels and associated `break`/`continue` if unused.

### [ ] Keep `no-unused-private-class-members` enabled (already on)

- Rule already exists as `error`; fix any violations by removing unused private members or wiring them into real behavior.

### [ ] Update `no-unused-vars` options to match target

- Current config ignores many `_`‑prefixed names; target uses more specific patterns:
  - `varsIgnorePattern: "[iI]gnored"`
  - `argsIgnorePattern: "^_"`
  - `caughtErrorsIgnorePattern: "^ignore"`
- Fixes:
  - Rename intentionally unused variables to match allowed ignore patterns (`_arg`, `ignoredVar`, `ignoreError`).
  - Remove genuinely unused variables or wire them into logic.

### [ ] Enable `no-useless-backreference`

- Disallow regex backreferences that can never match.
- Fixes:
  - Simplify or correct groupings and backreferences.

### [ ] Enable `no-useless-catch`

- Forbid catch blocks that only rethrow without adding value.
- Fixes:
  - Remove unnecessary try/catch or add logging/context.

### [ ] Enable `no-useless-escape`

- Disallow unnecessary escape characters.
- Fixes:
  - Remove extra backslashes while ensuring strings/regex still behave as intended.

### [ ] Enable `no-with`

- Forbid `with` statements (not allowed in strict mode).
- Fixes:
  - Rewrite code using explicit object references.

### [ ] Enable `require-yield`

- Ensure generator functions (`function*`) contain at least one `yield`.
- Fixes:
  - Convert unused generators to regular functions.
  - Add `yield` where generator semantics are truly needed.

### [ ] Enable `use-isnan`

- Forbid direct comparisons to `NaN`.
- Fixes:
  - Use `Number.isNaN(value)` or `isNaN` appropriately.

### [ ] Enable `valid-typeof`

- Validate `typeof` comparisons against valid strings (`"string"`, `"number"`, etc.).
- Fixes:
  - Correct typoed strings or use enum/constant wrappers.

### [ ] Enable `no-array-constructor`

- Prefer array literals over `new Array()` to avoid ambiguity.
- Fixes:
  - Replace `new Array()` with `[]` and `new Array(n)` with `Array(n).fill(...)` or similar, where necessary.

### [ ] Configure `curly` to `off` (from `error`)

- Aligns with target config; no code changes required.
- Local style rules (e.g., team conventions or formatter) should continue to enforce braces for control flow where desired.

---

## TypeScript: async & promises

### [ ] Replace `await-thenable` with `@typescript-eslint/await-thenable` (error)

- Enforce `await` only on true thenables/Promises.
- Fixes:
  - Remove `await` from plain values.
  - Ensure async functions actually return `Promise<T>`.

### [ ] Replace `no-floating-promises` with `@typescript-eslint/no-floating-promises`

- Catch Promises whose results are ignored.
- Fixes:
  - `await` async calls or explicitly handle them with `.then/.catch`.
  - For intentionally fire‑and‑forget calls, wrap in helper (e.g., `void someAsync()` or dedicated `voidAsync` function) to make intent explicit.

### [ ] Replace base `require-await` with `@typescript-eslint/require-await`

- Enforce that async functions contain `await` or are not async.
- Fixes:
  - Remove `async` from functions not using `await`.
  - Introduce `await` when you truly need asynchronous behavior instead of returning `Promise.resolve(...)`.

### [ ] Enable `@typescript-eslint/no-misused-promises`

- Forbid passing `Promise`‑returning functions where synchronous functions are expected (e.g., event handlers).
- Fixes:
  - Use `async` event handlers only where supported.
  - Wrap async logic in sync callbacks that handle errors internally.

### [ ] Enable `@typescript-eslint/no-for-in-array`

- Disallow `for...in` loops over arrays.
- Fixes:
  - Replace with `for...of`, `.forEach`, or indexed `for` loops.

### [ ] Enable `@typescript-eslint/no-implied-eval`

- Prevent `setTimeout`/`setInterval` with string arguments and similar patterns.
- Fixes:
  - Always pass a function, not a string, to async schedulers.

### [ ] Enable `@typescript-eslint/no-misused-new`

- Forbid using `new` with interfaces or misuse of constructors in TS.
- Fixes:
  - Use classes for constructable types; interfaces should describe shape only.

### [ ] Enable `@typescript-eslint/no-misused-spread`

- Catch unsafe or pointless spread operations (e.g., spreading non‑iterables).
- Fixes:
  - Ensure spread operands are iterable or object types as intended.
  - Replace spreads on `any` with explicit typed merges.

### [ ] Enable `@typescript-eslint/no-unsafe-unary-minus`

- Prevent applying unary minus to bigints or unsafe types.
- Fixes:
  - Use `-1n * value` patterns or appropriate numeric conversions.

### [ ] Configure `prefer-promise-reject-errors: off` and enable `@typescript-eslint/prefer-promise-reject-errors`

- Enforce rejecting promises with `Error` instances instead of bare values.
- Fixes:
  - Replace `Promise.reject('msg')` with `Promise.reject(new Error('msg'))`.
  - Wrap domain errors in custom `Error` subclasses where helpful.

---

## TypeScript: type safety & `any`

For many of these rules, type validation may be required where we don't currently have it.

If the violation is in application code and requires runtime validation, you shall use Arktype schemas to validate the "any" or "unknown" type. There may be existing schemas for your type next to the type itself that shall be used for validation. If there is no schema, and a new one is required, create the equivalent schema next to the type, and update the type to infer the schema to keep it DRY.

If the violation is in test files and requires type safety and creating a full object or service is overkill, you shall use the createMock<T>() utility function to mock the type with only the required properties.

### [ ] Replace `no-explicit-any` with `@typescript-eslint/no-explicit-any`

- Continue to forbid `any`, using TS‑ESLint semantics.
- Fixes:
  - Use generics, `unknown`, or specific union types.
  - In generic helper functions, keep the existing project convention: constrain `any` usage to necessary spots inside generic implementations only.

### [ ] Enable `@typescript-eslint/no-unsafe-assignment`

- Forbid assigning values of type `any` (or unsafely widened types) to typed variables.
- Fixes:
  - Narrow types at boundaries (parsers, IO) using type guards or runtime validation (e.g., schema validators).
  - Replace `any` sources with `unknown` and refine before assignment.

### [ ] Enable `@typescript-eslint/no-unsafe-call`

- Prevent calling values typed as `any`/unknown.
- Fixes:
  - Introduce proper function types or narrowing before calling.
  - Use discriminated unions or tagged interfaces for callable vs non‑callable values.

### [ ] Enable `@typescript-eslint/no-unsafe-member-access`

- Disallow property access on `any`/unknown.
- Fixes:
  - Use type guards (`in` checks, predicate functions) and refine types.
  - Introduce proper domain types instead of bag‑of‑keys objects.

### [ ] Enable `@typescript-eslint/no-unsafe-argument`

- Catch passing overly broad types (`any`) into typed APIs.
- Fixes:
  - Refine arguments before passing, using parsing/validation steps.

### [ ] Enable `@typescript-eslint/no-unsafe-return`

- Forbid returning `any`/unsafe values from typed functions.
- Fixes:
  - Ensure function internals narrow external input before returning.
  - Add specific return types and satisfy them via safe transformations.

### [ ] Enable `@typescript-eslint/no-unsafe-declaration-merging`

- Guard against unsafe interface/class declaration merging.
- Fixes:
  - Consolidate declarations or use composition instead of merging.

### [ ] Enable `@typescript-eslint/no-unsafe-enum-comparison`

- Catch comparisons mixing enums with other types unsafely.
- Fixes:
  - Compare enum values only with same enum type.
  - Use `as const` objects instead of enums where possible to maintain strict typing.

### [ ] Enable `@typescript-eslint/no-unsafe-function-type`

- Prevent overly broad function type usage.
- Fixes:
  - Use explicit parameter and return types instead of `(...args: any[]) => any`.

### [ ] Enable `@typescript-eslint/no-unsafe-type-assertion`

- Disallow unsafe `as` casts that can break soundness.
- Fixes:
  - Replace assertions with type guards or runtime checks (validation).
  - Use safer intermediate types instead of jumping between unrelated shapes.
  - Use "satisfies", if applicable, instead of "as"

### [ ] Enable `@typescript-eslint/no-wrapper-object-types`

- Forbid `String`, `Number`, `Boolean` object types; prefer primitives.
- Fixes:
  - Replace with `string`, `number`, `boolean` types.

### [ ] Enable `@typescript-eslint/no-empty-object-type`

- Catch empty object types that convey no information.
- Fixes:
  - Replace with `Record<string, unknown>` or specific shapes.
  - Use branded or discriminated unions when modeling states.

### [ ] Enable `@typescript-eslint/no-namespace`

- Discourage TS namespaces in favor of modules.
- Fixes:
  - Convert namespaces to plain modules using ES imports/exports.

### [ ] Enable `@typescript-eslint/no-duplicate-enum-values`

- Forbid duplicate values within enums.
- Fixes:
  - Give each enum member a unique value; consider using `as const` maps instead.

### [ ] Enable `@typescript-eslint/no-duplicate-type-constituents` (from `off` to `warn`)

- Catch union types that repeat the same constituent types.
- Fixes:
  - Remove duplicates from union types.

### [ ] Enable `@typescript-eslint/no-redundant-type-constituents` (from `off` to `error`)

- Forbid unions where one type is a subtype of another (redundant).
- Fixes:
  - Simplify unions to the minimal expressive set of types.

### [ ] Enable `@typescript-eslint/no-extra-non-null-assertion`

- Disallow redundant `!` operators.
- Fixes:
  - Remove extra `!` when type is already non‑nullable.
  - Prefer type guards and narrowing to reduce the need for `!`.

### [ ] Enable `@typescript-eslint/no-non-null-asserted-optional-chain`

- Forbid `foo?.bar!.baz` style patterns.
- Fixes:
  - Avoid mixing optional chaining with non‑null assertions; use explicit null checks instead.

### [ ] Enable `@typescript-eslint/no-unnecessary-type-assertion`

- Catch `as` casts that don’t change the type.
- Fixes:
  - Remove unnecessary assertions.
  - Fix underlying type annotations so assertions aren’t needed.

### [ ] Enable `@typescript-eslint/no-unnecessary-type-constraint`

- Disallow generic constraints that provide no additional information (`<T extends unknown>`).
- Fixes:
  - Remove redundant `extends unknown`/`extends any` constraints.

### [ ] Enable `@typescript-eslint/no-array-delete`

- Forbid using `delete` on array elements.
- Fixes:
  - Use `splice`, `filter`, or immutable array operations.

### [ ] Enable `@typescript-eslint/no-base-to-string`

- Prevent calling `.toString()` on potentially unsafe base types.
- Fixes:
  - Narrow types before stringifying or use safe serializers.

### [ ] Enable `@typescript-eslint/no-require-imports`

- Forbid `require()` in TS modules; prefer `import`.
- Fixes:
  - Convert CommonJS requires to ES module imports.

### [ ] Enable `@typescript-eslint/no-this-alias` (from `off` to `error`)

- Forbid patterns like `const self = this` in TS.
- Fixes:
  - Use arrow functions to preserve `this` or refactor state into closures.

### [ ] Enable `@typescript-eslint/only-throw-error`

- Enforce throwing `Error` instances or subclasses.
- Fixes:
  - Replace `throw 'msg'` with `throw new Error('msg')`.

### [ ] Enable `@typescript-eslint/prefer-as-const` (replaces base `prefer-as-const`)

- Suggest `as const` for literal types where beneficial.
- Fixes:
  - Add `as const` to readonly tuples or literal objects to increase type precision.

### [ ] Enable `@typescript-eslint/prefer-namespace-keyword`

- Prefer `namespace` keyword over `module` for TS namespaces when they are required.
- Fixes:
  - Replace `module` with `namespace` where still used.

### [ ] Enable `@typescript-eslint/restrict-plus-operands`

- Forbid `+` on mixed or non‑numeric types.
- Fixes:
  - Ensure both operands are numbers or strings, never broader unions.
  - Use template literals or explicit conversions when concatenating.

### [ ] Replace `restrict-template-expressions` with `@typescript-eslint/restrict-template-expressions`

- Enforce that interpolated values in template strings have acceptable types.
- Fixes:
  - Explicitly convert objects to strings (`JSON.stringify`) or format them.

### [ ] Enable `@typescript-eslint/triple-slash-reference`

- Forbid or tightly control `/// <reference ...>` directives.
- Fixes:
  - Replace with proper module imports and `tsconfig` configuration.

### [ ] Replace `unbound-method` with `@typescript-eslint/unbound-method`

- Catch passing unbound methods as callbacks.
- Fixes:
  - Bind methods (`obj.method.bind(obj)`) or wrap in arrow functions.

### [ ] Enable `@typescript-eslint/switch-exhaustiveness-check`

- Enforce exhaustive `switch` handling for unions and enums.
- Fixes:
  - Handle all union cases explicitly.
  - Use `never` checks in `default` branches to force exhaustiveness at compile time.

### [ ] Enable `@typescript-eslint/no-non-null-assertion`

- Forbid the `!` non‑null assertion operator.
- Fixes:
  - Replace with proper runtime checks and type narrowing.
  - Use discriminated unions and state machines rather than relying on `!`.

---

## Expressions, control flow, and vars

### [ ] Enable `no-unused-expressions` (from `off` to `error`)

- Forbid expression statements that do nothing (e.g., `foo && bar()` patterns when not intended).
- Fixes:
  - For effectful expressions, be explicit (`if (foo) { bar(); }`).
  - Remove truly dead expressions.

### [ ] Enable `block-scoped-var`

- Treat `var` as block‑scoped for detection of misuse.
- Fixes:
  - Replace `var` with `let`/`const` or refactor scopes.

### [ ] Enable `eqeqeq`

- Enforce `===`/`!==` over `==`/`!=`.
- Fixes:
  - Replace loose comparisons with strict ones, adding explicit coercion where necessary.

### [ ] Enable `no-var`

- Forbid `var` declarations.
- Fixes:
  - Use `let`/`const` with the narrowest possible scope.

### [ ] Align `no-restricted-globals` with target list

- Target uses direct list (`event`, `length`, `stop`, `toString`, `alert`, `origin`, `status`).
- Fixes:
  - Rename variables shadowing these globals.
  - Avoid relying on implicit browser globals (`event`); access from handlers via parameters instead.

---

## Throwing & errors

### [ ] Configure base `no-throw-literal` to `off` and enable `@typescript-eslint/only-throw-error`

- Rely on TS version for strictness.
- Fixes:
  - As above: always throw `Error` instances or subclasses.

---

## Final cleanup

### [ ] Reconcile test overrides with new TS rules

- Existing overrides:
  - Tests: `no-explicit-any: off` for `**/*.test.ts`/`**/*.spec.ts`/vitest config.
- Remove this override and fix all violations of this error. Test and spec files shall adhere to type safety as well.

### [ ] Run full oxlint and fix remaining edge cases

- After all per‑rule passes, run oxlint at the repo root without filters.
- Any remaining violations likely involve complex patterns; coordinate with senior devs for refactors rather than local disabling.
