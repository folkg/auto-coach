import { TestBed } from "@angular/core/testing";
import { describe, it } from "vitest";
import { DirtyFormGuard } from "./dirty-form.guard";

describe("DirtyFormGuard", () => {
  let guard: DirtyFormGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    guard = TestBed.inject(DirtyFormGuard);
  });

  it("is created", () => {
    expect(guard).toBeTruthy();
  });

  it.todo("more tests");
});
