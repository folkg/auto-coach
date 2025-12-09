import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { APIService } from "./api.service";

describe("APIService", () => {
  let service: APIService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(APIService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
