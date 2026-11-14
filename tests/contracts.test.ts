import { describe, expect, test } from "bun:test";
import {
  calendarQuerySchema,
  commentCreateSchema,
  incidentCreateSchema,
  notificationPreferencesSchema,
  savedFilterCreateSchema,
  taskBulkSchema,
} from "../shared/contracts";

describe("contract validation", () => {
  test("normalizes a valid incident", () => {
    const parsed = incidentCreateSchema.parse({
      projectId: "11111111-1111-4111-8111-111111111111",
      title: "Outage",
      severity: "high",
    });
    expect(parsed.status).toBe("open");
    expect(parsed.assigneeId).toBeNull();
    expect(parsed.dueDate).toBeNull();
  });

  test("rejects a comment with multiple hosts", () => {
    expect(
      commentCreateSchema.safeParse({
        body: "Hello",
        taskId: "11111111-1111-4111-8111-111111111111",
        incidentId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(false);
  });

  test("accepts a single-host comment", () => {
    expect(
      commentCreateSchema.safeParse({
        body: "Hello",
        taskId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });

  test("validates calendar ranges", () => {
    expect(
      calendarQuerySchema.safeParse({
        from: "2026-01-01",
        to: "2026-02-01",
      }).success,
    ).toBe(true);
    expect(
      calendarQuerySchema.safeParse({
        from: "2026-02-01",
        to: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      calendarQuerySchema.safeParse({
        from: "2025-01-01",
        to: "2026-02-01",
      }).success,
    ).toBe(false);
  });

  test("restricts bulk status to todo or done", () => {
    expect(
      taskBulkSchema.safeParse({
        taskIds: ["11111111-1111-4111-8111-111111111111"],
        action: "status",
        value: "in_review",
      }).success,
    ).toBe(false);
    expect(
      taskBulkSchema.safeParse({
        taskIds: ["11111111-1111-4111-8111-111111111111"],
        action: "status",
        value: "done",
      }).success,
    ).toBe(true);
  });

  test("validates notification preferences and saved filters", () => {
    expect(
      notificationPreferencesSchema.safeParse({
        types: {
          taskAssigned: true,
          reviewRequested: true,
          dueSoon: true,
          incidentUpdates: true,
          membershipChanges: true,
          mentions: true,
          replies: true,
        },
        quietHours: { enabled: true, start: "22:00", end: "08:00" },
      }).success,
    ).toBe(true);
    expect(
      savedFilterCreateSchema.safeParse({
        scope: "tasks",
        name: "Mine",
        query: { mine: true },
      }).success,
    ).toBe(true);
    expect(
      savedFilterCreateSchema.safeParse({
        scope: "everything",
        name: "Bad",
        query: {},
      }).success,
    ).toBe(false);
  });
});
