import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../utils/markdown";

describe("Markdown rendering", () => {
  test("renders GFM while sanitizing active content", async () => {
    const html = await renderMarkdown(`
# Task details

| State | Owner |
| --- | --- |
| Ready | Portal |

<script>alert("xss")</script>

[unsafe](javascript:alert("xss"))
`);

    expect(html).toContain("<h1>Task details</h1>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
