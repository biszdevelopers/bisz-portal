import { describe, expect, test } from "bun:test";
import {
  formatTaskDueDate,
  markdownExcerpt,
  taskStatusLabel,
} from "../utils/tasks";

describe("task presentation", () => {
  test("formats date-only values without parsing them as UTC timestamps", () => {
    expect(formatTaskDueDate("2028-02-29")).not.toBe("Invalid due date");
    expect(formatTaskDueDate(null)).toBe("No due date");
    expect(formatTaskDueDate("2028-02-29T00:00:00Z")).toBe(
      "Invalid due date",
    );
  });

  test("creates concise plain-text excerpts from Markdown", () => {
    expect(markdownExcerpt("# Heading\n\n[Portal](https://example.test) **ready**"))
      .toBe("Heading Portal ready");
    expect(markdownExcerpt("", 20)).toBe("No description provided.");
    expect(taskStatusLabel("in_progress")).toBe("in progress");
  });
});
