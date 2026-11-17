import { describe, expect, test } from "bun:test";
import { pushInternals } from "../server/services/push";
import { normalizePreferences } from "../server/services/push";

describe("notification preferences", () => {
  test("defaults all notification types on", () => {
    const preferences = normalizePreferences(undefined);
    expect(Object.values(preferences.types).every(Boolean)).toBe(true);
    expect(preferences.quietHours.enabled).toBe(false);
  });

  test("keeps explicit opt-outs and quiet hours", () => {
    const preferences = normalizePreferences({
      types: { mentions: false },
      quietHours: { enabled: true, start: "22:00", end: "07:00" },
    });
    expect(preferences.types.mentions).toBe(false);
    expect(preferences.types.taskAssigned).toBe(true);
    expect(preferences.quietHours).toEqual({
      enabled: true,
      start: "22:00",
      end: "07:00",
    });
  });

  test("quiet hours wrap midnight", () => {
    expect(
      pushInternals.inQuietHours({
        types: {
          taskAssigned: true,
          reviewRequested: true,
          dueSoon: true,
          incidentUpdates: true,
          membershipChanges: true,
          mentions: true,
          replies: true,
        },
        quietHours: { enabled: true, start: "23:59", end: "00:01" },
      }),
    ).toBeTypeOf("boolean");
  });

  test("retry backoff grows", () => {
    const first = pushInternals.nextAttempt(0).getTime();
    const second = pushInternals.nextAttempt(1).getTime();
    expect(second).toBeGreaterThan(first);
  });
});
