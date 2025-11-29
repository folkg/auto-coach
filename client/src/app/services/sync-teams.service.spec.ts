import { beforeEach, describe, expect, it } from "vitest";
import { TestBed } from "@angular/core/testing";
import { SyncTeamsService } from "./sync-teams.service";

describe("FetchTeamsService", () => {
  let service: SyncTeamsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncTeamsService);
  });

  it("is created", () => {
    expect(service).toBeTruthy();
  });

  it.todo("more tests");
});
