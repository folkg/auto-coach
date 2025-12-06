import type { CanActivateFn } from "@angular/router";

import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { loginGuard } from "./login.guard";

describe("loginGuard", () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => loginGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it("is created", () => {
    expect(executeGuard).toBeTruthy();
  });

  it.todo("more tests");
});
