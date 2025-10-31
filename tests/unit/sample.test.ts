import { describe, test, expect } from "bun:test";

describe("Sample Test", () => {
  test("should pass", () => {
    expect(1 + 1).toBe(2);
  });

  test("bun test is working", () => {
    expect(true).toBe(true);
  });
});
