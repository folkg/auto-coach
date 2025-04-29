import { TestBed } from "@angular/core/testing";
import { describe, it } from "vitest";
import { AppStatusService } from "./app-status.service";

describe("AppStatusService", () => {
  let service: AppStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AppStatusService);
  });

  it("is created", () => {
    expect(service).toBeTruthy();
  });

  it.todo("more tests");
});
