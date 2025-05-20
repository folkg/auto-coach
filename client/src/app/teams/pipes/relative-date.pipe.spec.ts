import { describe, expect, it } from "vitest";
import { RelativeDatePipe } from "./relative-date.pipe";

describe("RelativeDatePipe", () => {
  it("create an instance", () => {
    const pipe = new RelativeDatePipe();
    expect(pipe).toBeTruthy();
  });

  it.todo("more tests");
});
