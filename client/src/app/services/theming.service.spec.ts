import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemingService } from "./theming.service";

describe("ThemingService", () => {
  let service: ThemingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemingService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it.todo("more tests");
});
