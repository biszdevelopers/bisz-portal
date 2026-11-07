import { describe, expect, test } from "bun:test";
import {
  taskStatusTransitionSchema,
} from "../shared/contracts";
import {
  formatTaskDueDate,
  markdownExcerpt,
  taskStatusLabel,
  taskMatchesOverview,
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
    expect(taskStatusLabel("in_review")).toBe("in review");
  });
});

describe("task review transitions", () => {
  test("accepts only the task workflow statuses", () => {
    expect(taskStatusTransitionSchema.parse({ status: "in_review" })).toEqual({
      status: "in_review",
    });
    expect(taskStatusTransitionSchema.parse({ status: "todo" })).toEqual({
      status: "todo",
    });
    expect(taskStatusTransitionSchema.parse({ status: "done" })).toEqual({
      status: "done",
    });
    expect(
      taskStatusTransitionSchema.safeParse({ status: "in_progress" }).success,
    ).toBe(false);
    expect(
      taskStatusTransitionSchema.safeParse({ status: "in_review", extra: true })
        .success,
    ).toBe(false);
  });
});

describe("task overview visibility", () => {
  const userId = "10000000-0000-4000-8000-000000000001";
  const otherId = "10000000-0000-4000-8000-000000000002";
  const task = {
    creatorId: userId,
    projectId: "20000000-0000-4000-8000-000000000001",
    status: "todo" as const,
    members: [] as Array<{
      userId: string;
      displayName: string;
      image: string | null;
      role: "assignee";
    }>,
  };

  test("shows created tasks only in All unless the user is assigned", () => {
    expect(taskMatchesOverview(task, userId, "all")).toBe(true);
    expect(taskMatchesOverview(task, userId, "todo")).toBe(false);
    expect(taskMatchesOverview(task, otherId, "all")).toBe(false);

    const assigned = {
      ...task,
      creatorId: otherId,
      members: [
        { userId, displayName: "User", image: null, role: "assignee" as const },
      ],
    };
    expect(taskMatchesOverview(assigned, userId, "todo")).toBe(true);
    expect(taskMatchesOverview(assigned, userId, "done")).toBe(false);
    expect(taskMatchesOverview(assigned, userId, "all")).toBe(true);
  });
});
