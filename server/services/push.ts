import { and, eq, lte } from "drizzle-orm";
import { databasePool, useDatabase } from "~/server/database/client";
import {
  notifications,
  pushDeliveries,
  pushSubscriptions,
  userSettings,
} from "~/server/database/schema";
import type {
  NotificationPreferences,
  NotificationPreferenceKey,
} from "~/shared/contracts";
import {
  sendWebPush,
  unsealPushSecret,
  type PushPayload,
} from "~/server/utils/web-push";

type DbClient = ReturnType<typeof useDatabase>;
type TransactionClient = Parameters<
  Parameters<DbClient["transaction"]>[0]
>[0];
type DatabaseWriter = DbClient | TransactionClient;

const preferenceByType: Record<string, NotificationPreferenceKey> = {
  task_assigned: "taskAssigned",
  review_requested: "reviewRequested",
  due_soon: "dueSoon",
  due_overdue: "dueSoon",
  incident_created: "incidentUpdates",
  incident_assigned: "incidentUpdates",
  incident_resolved: "incidentUpdates",
  membership_added: "membershipChanges",
  membership_removed: "membershipChanges",
  permissions_changed: "membershipChanges",
  comment_mention: "mentions",
  comment_reply: "replies",
};

const defaultPreferences: NotificationPreferences = {
  types: {
    taskAssigned: true,
    reviewRequested: true,
    dueSoon: true,
    incidentUpdates: true,
    membershipChanges: true,
    mentions: true,
    replies: true,
  },
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
};

export function normalizePreferences(
  value:
    | {
        types?: Partial<Record<NotificationPreferenceKey, boolean>>;
        quietHours?: Partial<NotificationPreferences["quietHours"]>;
      }
    | null
    | undefined,
): NotificationPreferences {
  return {
    types: {
      ...defaultPreferences.types,
      ...(value?.types ?? {}),
    },
    quietHours: {
      ...defaultPreferences.quietHours,
      ...(value?.quietHours ?? {}),
    },
  };
}

function inQuietHours(preferences: NotificationPreferences) {
  const quiet = preferences.quietHours;
  if (!quiet.enabled) return false;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [startHour = 0, startMinute = 0] = quiet.start.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = quiet.end.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (start === end) return false;
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

export function pushConfigured() {
  const config = useRuntimeConfig();
  return Boolean(
    config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject,
  );
}

export async function pushAllowed(
  userId: string,
  type: string,
  db: DatabaseWriter = useDatabase(),
): Promise<NotificationPreferences> {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const preferences = normalizePreferences(settings?.notificationPreferences);
  const key = preferenceByType[type];
  if (!key) return preferences;
  return preferences;
}

export async function enqueuePush(
  db: DatabaseWriter,
  input: {
    notificationId: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    url: string;
    tag: string;
  },
) {
  if (!pushConfigured()) return;
  const preferences = await pushAllowed(input.userId, input.type, db);
  const key = preferenceByType[input.type];
  if (key && preferences.types[key] === false) return;
  if (inQuietHours(preferences)) return;

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, input.userId))
    .limit(10);
  if (!subscriptions.length) return;

  await db.insert(pushDeliveries).values(
    subscriptions.map((subscription) => ({
      notificationId: input.notificationId,
      subscriptionId: subscription.id,
    })),
  );
}

function nextAttempt(attempts: number) {
  const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
  const delay = delays[Math.min(attempts, delays.length - 1)] ?? delays.at(-1)!;
  return new Date(Date.now() + delay);
}

function urgency(type: string) {
  if (type === "review_requested" || type.startsWith("incident_"))
    return "high" as const;
  if (type.startsWith("due_")) return "low" as const;
  return "normal" as const;
}

function internalUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

let processing = false;

export async function processPushQueue() {
  if (!pushConfigured() || processing) return;
  processing = true;
  const client = await databasePool().connect().catch(() => null);
  if (!client) {
    processing = false;
    return;
  }
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('bisz-portal:push-queue')) AS locked",
    );
    if (!lock.rows[0]?.locked) return;

    const deliveries = await useDatabase()
      .select({
        delivery: pushDeliveries,
        notification: notifications,
        subscription: pushSubscriptions,
      })
      .from(pushDeliveries)
      .innerJoin(
        notifications,
        eq(pushDeliveries.notificationId, notifications.id),
      )
      .innerJoin(
        pushSubscriptions,
        eq(pushDeliveries.subscriptionId, pushSubscriptions.id),
      )
      .where(
        and(
          eq(pushDeliveries.status, "pending"),
          lte(pushDeliveries.nextAttemptAt, new Date()),
        ),
      )
      .limit(50);

    for (const { delivery, notification, subscription } of deliveries) {
      const payload: PushPayload = {
        title: notification.title.slice(0, 120),
        body: notification.body.slice(0, 500),
        url: internalUrl(notification.url),
        tag: notification.dedupeKey,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
      };
      try {
        const response = await sendWebPush(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: unsealPushSecret(subscription.auth, subscription.userId),
          },
          payload,
          urgency(notification.type),
        );
        if (response.ok) {
          await useDatabase()
            .update(pushDeliveries)
            .set({ status: "sent", lastError: null })
            .where(eq(pushDeliveries.id, delivery.id));
          continue;
        }
        if (response.status === 404 || response.status === 410) {
          await useDatabase()
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, subscription.id));
          continue;
        }
        const attempts = delivery.attempts + 1;
        const dead =
          attempts >= 5 ||
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403;
        await useDatabase()
          .update(pushDeliveries)
          .set({
            status: dead ? "dead" : "pending",
            attempts,
            nextAttemptAt: nextAttempt(attempts),
            lastError: `HTTP ${response.status}`,
          })
          .where(eq(pushDeliveries.id, delivery.id));
      } catch (error) {
        const attempts = delivery.attempts + 1;
        await useDatabase()
          .update(pushDeliveries)
          .set({
            status: attempts >= 5 ? "dead" : "pending",
            attempts,
            nextAttemptAt: nextAttempt(attempts),
            lastError:
              error instanceof Error ? error.message : "Push delivery failed",
          })
          .where(eq(pushDeliveries.id, delivery.id));
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('bisz-portal:push-queue'))")
      .catch(() => undefined);
    client.release();
    processing = false;
  }
}

export async function cleanupPushData() {
  const db = useDatabase();
  await db
    .delete(pushDeliveries)
    .where(lte(pushDeliveries.createdAt, new Date(Date.now() - 30 * 86_400_000)))
    .catch(() => undefined);
}

export const pushInternals = { inQuietHours, nextAttempt, urgency };
