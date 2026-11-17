import { describe, expect, test } from "bun:test";
import { activityView } from "../server/services/activity";
import { formatDate, initials, safeInternalUrl, timeAgo } from "../utils/format";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  type: "task_created" as const,
  taskId: null,
  incidentId: null,
  commentId: null,
  metadata: { title: "Ship it" },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("activity views", () => {
  test("resolves the actor and serializes timestamps", () => {
    const view = activityView(row, new Map([
      [row.actorId, { displayName: "Ada", image: null }],
    ]));
    expect(view.actor?.displayName).toBe("Ada");
    expect(view.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(view.metadata.title).toBe("Ship it");
  });

  test("tolerates a missing actor", () => {
    const view = activityView(row, new Map());
    expect(view.actor).toBeNull();
  });
});

describe("format helpers", () => {
  test("initializes names", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("")).toBe("?");
  });

  test("formats date-only values without a timezone shift", () => {
    expect(formatDate("2026-01-05")).toContain("2026");
  });

  test("allows only internal links", () => {
    expect(safeInternalUrl("/tasks/1")).toBe("/tasks/1");
    expect(safeInternalUrl("//evil.example")).toBe("/");
    expect(safeInternalUrl("https://evil.example")).toBe("/");
  });

  test("renders a relative time", () => {
    expect(timeAgo(new Date())).toContain("now");
  });
});
