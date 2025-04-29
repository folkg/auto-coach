import { TestBed } from "@angular/core/testing";
import { describe, it } from "vitest";
import { RequestInterceptor } from "./request.interceptor";

describe("RequestInterceptor", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [RequestInterceptor],
    }),
  );

  it("is created", () => {
    const interceptor: RequestInterceptor = TestBed.inject(RequestInterceptor);
    expect(interceptor).toBeTruthy();
  });

  it.todo("more tests");
});
