import { describe, expect, it } from "vitest";

import { NthPipe } from "./nth.pipe";

describe("NthPipe", () => {
  it("creates an instance", () => {
    const pipe = new NthPipe();
    expect(pipe).toBeTruthy();
  });

  it.todo("more tests");
});
