import { describe, expect, test } from "bun:test";
import {
  addDays,
  escapeLike,
  localDateOnly,
  searchPattern,
} from "../server/utils/text-search";
import { decodeCursor, encodeCursor } from "../server/utils/cursor";

describe("search helpers", () => {
  test("escapes LIKE metacharacters", () => {
    expect(escapeLike("100%_done\\now")).toBe("100\\%\\_done\\\\now");
    expect(searchPattern("a%b")).toBe("%a\\%b%");
  });

  test("date helpers are stable", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(localDateOnly(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("keyset cursor", () => {
  test("round-trips a valid cursor", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const date = new Date("2026-01-01T00:00:00.000Z");
    const encoded = encodeCursor(date, id);
    expect(decodeCursor(encoded)).toEqual({ createdAt: date, id });
  });

  test("rejects malformed cursors", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from('{"t":"x","i":"y"}').toString("base64url"))).toBeNull();
  });
});
