import { describe, expect, test } from "bun:test";
import {
  normalizeTagName,
  tagCreateSchema,
  tagDeleteSchema,
  tagQuerySchema,
} from "../shared/contracts";
import { tagColorOptions, tagColorValue } from "../utils/tags";
import { escapeTagLikePattern } from "../server/utils/tags";

describe("tag contracts", () => {
  test("normalizes names to canonical lowercase Unicode", () => {
    expect(normalizeTagName("  ＤｅｖＯｐｓ  ")).toBe("devops");
    expect(
      tagCreateSchema.parse({ name: "  Release-2027  ", color: "purple" }),
    ).toEqual({ name: "release-2027", color: "purple" });
  });

  test("rejects empty, whitespace-containing, oversized, and unknown colors", () => {
    expect(
      tagCreateSchema.safeParse({ name: "two words", color: "blue" }).success,
    ).toBe(false);
    expect(
      tagCreateSchema.safeParse({ name: "two\twords", color: "blue" }).success,
    ).toBe(false);
    expect(
      tagCreateSchema.safeParse({ name: "x".repeat(65), color: "blue" })
        .success,
    ).toBe(false);
    expect(
      tagCreateSchema.safeParse({ name: "valid", color: "orange" }).success,
    ).toBe(false);
    expect(
      tagCreateSchema.safeParse({ name: "   ", color: "blue" }).success,
    ).toBe(false);
  });

  test("accepts punctuation while rejecting extra mutation fields", () => {
    expect(
      tagCreateSchema.parse({ name: "bug:ui/v2", color: "red" }),
    ).toEqual({ name: "bug:ui/v2", color: "red" });
    expect(
      tagDeleteSchema.safeParse({ name: "bug", force: true }).success,
    ).toBe(false);
  });

  test("accepts either a search term or bounded repeated exact names", () => {
    expect(tagQuerySchema.parse({ q: "  DEV  " })).toEqual({ q: "dev" });
    expect(tagQuerySchema.parse({ name: "One" })).toEqual({ name: ["one"] });
    expect(tagQuerySchema.parse({ name: ["One", "TWO"] })).toEqual({
      name: ["one", "two"],
    });
    expect(tagQuerySchema.safeParse({}).success).toBe(false);
    expect(tagQuerySchema.safeParse({ q: "dev", name: "dev" }).success).toBe(
      false,
    );
    expect(
      tagQuerySchema.safeParse({ name: Array.from({ length: 101 }, (_, i) => `tag-${i}`) })
        .success,
    ).toBe(false);
  });

  test("escapes SQL LIKE metacharacters so searches remain literal", () => {
    expect(escapeTagLikePattern("100%_done\\later")).toBe(
      "100\\%\\_done\\\\later",
    );
  });
});

describe("tag colors", () => {
  test("provides six distinct stored choices and a safe fallback", () => {
    expect(tagColorOptions.map(({ value }) => value)).toEqual([
      "blue",
      "green",
      "amber",
      "red",
      "gray",
      "purple",
    ]);
    expect(new Set(tagColorOptions.map(({ color }) => color).values()).size).toBe(6);
    expect(tagColorValue("purple")).toBe("#8b5cf6");
  });
});
