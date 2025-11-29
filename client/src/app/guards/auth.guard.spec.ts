import { beforeEach, describe, expect, it } from "vitest";
import type { CanActivateFn } from "@angular/router";
import { TestBed } from "@angular/core/testing";
import { authGuard } from "./auth.guard";

describe("authGuard", () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it("is created", () => {
    expect(executeGuard).toBeTruthy();
  });

  it.todo("more");
});
