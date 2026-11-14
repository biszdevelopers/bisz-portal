import { describe, expect, test } from "bun:test";
import { FixedWindowLimiter } from "../server/utils/rate-limit";

describe("fixed window limiter", () => {
  test("allows requests up to the limit", () => {
    const limiter = new FixedWindowLimiter(2, 1_000);
    expect(limiter.take("user", 0).allowed).toBe(true);
    expect(limiter.take("user", 1).allowed).toBe(true);
    expect(limiter.take("user", 2).allowed).toBe(false);
  });

  test("resets after the window", () => {
    const limiter = new FixedWindowLimiter(1, 1_000);
    expect(limiter.take("user", 0).allowed).toBe(true);
    expect(limiter.take("user", 500).allowed).toBe(false);
    expect(limiter.take("user", 1_000).allowed).toBe(true);
  });

  test("isolates keys and prunes expired windows", () => {
    const limiter = new FixedWindowLimiter(1, 1_000);
    expect(limiter.take("a", 0).allowed).toBe(true);
    expect(limiter.take("b", 0).allowed).toBe(true);
    limiter.prune(2_000);
    expect(limiter.take("a", 2_001).allowed).toBe(true);
  });
});
