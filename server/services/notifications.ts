import { and, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { databasePool, useDatabase } from "~/server/database/client";
import {
  notifications,
  projectMembers,
  projects,
  taskMembers,
  tasks,
  userSettings,
} from "~/server/database/schema";
import { findBasisUsers } from "~/server/utils/basis-users";
import { decodeCursor, encodeCursor } from "~/server/utils/cursor";
import type {
  NotificationPage,
  NotificationPreferences,
  NotificationSummary,
  NotificationView,
  UserSummary,
} from "~/shared/contracts";
import { enqueuePush, normalizePreferences } from "~/server/services/push";
import { addDays, localDateOnly } from "~/server/utils/text-search";

type DbClient = ReturnType<typeof useDatabase>;
type TransactionClient = Parameters<
  Parameters<DbClient["transaction"]>[0]
>[0];
type DatabaseWriter = DbClient | TransactionClient;

export type NotificationInput = {
  userId: string;
  type:
    | "task_assigned"
    | "review_requested"
    | "due_soon"
    | "due_overdue"
    | "incident_created"
    | "incident_assigned"
    | "incident_resolved"
    | "membership_added"
    | "membership_removed"
    | "permissions_changed"
    | "comment_mention"
    | "comment_reply";
  title: string;
  body?: string;
  url: string;
  projectId?: string | null;
  taskId?: string | null;
  incidentId?: string | null;
  commentId?: string | null;
  actorId?: string | null;
  dedupeKey: string;
};

export async function createNotifications(
  db: DatabaseWriter,
  inputs: NotificationInput[],
) {
  if (!inputs.length) return [];
  const inserted = await db
    .insert(notifications)
    .values(
      inputs.map((input) => ({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? "",
        url: input.url,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        incidentId: input.incidentId ?? null,
        commentId: input.commentId ?? null,
        actorId: input.actorId ?? null,
        dedupeKey: input.dedupeKey,
      })),
    )
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    })
    .returning({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      dedupeKey: notifications.dedupeKey,
    });

  for (const notification of inserted) {
    await enqueuePush(db, {
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      url: notification.url,
      tag: notification.dedupeKey,
    });
  }
  return inserted;
}

function summaryUser(
  userId: string,
  users: Map<string, { displayName: string; image: string | null } | null>,
): UserSummary | null {
  const user = users.get(userId);
  if (!user) return null;
  return {
    id: userId,
    displayName: user.displayName,
    email: "",
    image: user.image,
  };
}

export async function listNotifications(input: {
  userId: string;
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationPage> {
  const limit = input.limit ?? 20;
  const cursor = decodeCursor(input.cursor);
  const conditions = [eq(notifications.userId, input.userId)];
  if (input.unreadOnly) conditions.push(isNull(notifications.readAt));
  if (cursor) {
    conditions.push(
      or(
        lt(notifications.createdAt, cursor.createdAt),
        and(
          eq(notifications.createdAt, cursor.createdAt),
          lt(notifications.id, cursor.id),
        ),
      )!,
    );
  }
  const db = useDatabase();
  const [rows, unreadRows] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1),
    db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          isNull(notifications.readAt),
        ),
      ),
  ]);
  const pageRows = rows.slice(0, limit);
  const users = await findBasisUsers(
    pageRows
      .map((row) => row.actorId)
      .filter((value): value is string => Boolean(value)),
  );
  const last = pageRows.at(-1);
  return {
    notifications: pageRows.map(
      (row): NotificationView => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        url: row.url,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        actor: row.actorId ? summaryUser(row.actorId, users) : null,
        projectId: row.projectId,
        taskId: row.taskId,
        incidentId: row.incidentId,
        commentId: row.commentId,
      }),
    ),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.createdAt, last.id)
        : null,
    unread: Number(unreadRows[0]?.value ?? 0),
  };
}

export async function notificationSummary(
  userId: string,
): Promise<NotificationSummary> {
  const db = useDatabase();
  const [unreadRows, latest] = await Promise.all([
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(1),
  ]);
  return {
    unread: Number(unreadRows[0]?.value ?? 0),
    latestId: latest[0]?.id ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export async function markNotificationsRead(
  userId: string,
  ids?: string[],
) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids?.length) conditions.push(inArray(notifications.id, ids));
  await useDatabase()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const [settings] = await useDatabase()
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return normalizePreferences(settings?.notificationPreferences);
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
) {
  await useDatabase()
    .insert(userSettings)
    .values({
      userId,
      notificationPreferences: preferences,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        notificationPreferences: preferences,
        updatedAt: new Date(),
      },
    });
}

export async function projectRecipientsWithPermission(
  projectId: string,
  permission: string,
) {
  const rows = await useDatabase()
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  return rows
    .filter(
      (member) =>
        member.role === "owner" || member.permissions.includes(permission as never),
    )
    .map((member) => member.userId);
}

export async function projectMemberIds(projectId: string) {
  const rows = await useDatabase()
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  return rows.map((row) => row.userId);
}

export async function notifyCommentParticipants(input: {
  actorId: string;
  commentId: string;
  projectId: string | null;
  taskId: string | null;
  incidentId: string | null;
  title: string;
  url: string;
  mentionIds: string[];
  participantIds: string[];
}) {
  const recipients = new Set<string>();
  for (const userId of input.mentionIds) {
    if (userId !== input.actorId) recipients.add(userId);
  }
  for (const userId of input.participantIds) {
    if (userId !== input.actorId) recipients.add(userId);
  }
  const inputs = [...recipients].map((userId) => {
    const mentioned = input.mentionIds.includes(userId);
    return {
      userId,
      type: mentioned ? ("comment_mention" as const) : ("comment_reply" as const),
      title: mentioned
        ? `${input.title}: you were mentioned`
        : `${input.title}: new reply`,
      body: "",
      url: input.url,
      projectId: input.projectId,
      taskId: input.taskId,
      incidentId: input.incidentId,
      commentId: input.commentId,
      actorId: input.actorId,
      dedupeKey: `${mentioned ? "mention" : "reply"}:${input.commentId}:${userId}`,
    };
  });
  await createNotifications(useDatabase(), inputs);
}

async function claimDueSweep(userId: string) {
  const result = await databasePool().query<{ user_id: string }>(
    `INSERT INTO user_settings (user_id, last_due_sweep_at, updated_at)
     VALUES ($1, now(), now())
     ON CONFLICT (user_id) DO UPDATE SET last_due_sweep_at = now(), updated_at = now()
     WHERE user_settings.last_due_sweep_at IS NULL
        OR user_settings.last_due_sweep_at < now() - interval '10 minutes'
     RETURNING user_id`,
    [userId],
  );
  return result.rowCount === 1;
}

let lastAllSweep = 0;

export async function sweepAllDueNotifications() {
  if (Date.now() - lastAllSweep < 15 * 60_000) return;
  lastAllSweep = Date.now();
  const client = await databasePool().connect().catch(() => null);
  if (!client) return;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('bisz-portal:due-sweep-all')) AS locked",
    );
    if (!lock.rows[0]?.locked) return;
    const today = localDateOnly();
    const tomorrow = addDays(today, 1);
    const rows = await useDatabase()
      .select({
        userId: taskMembers.userId,
        task: tasks,
        projectName: projects.name,
      })
      .from(taskMembers)
      .innerJoin(tasks, eq(taskMembers.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          inArray(tasks.status, ["todo", "in_review"]),
          sql`${tasks.dueDate} is not null and ${tasks.dueDate} <= ${tomorrow}`,
        ),
      )
      .limit(500);
    const inputs: NotificationInput[] = [];
    for (const { userId, task, projectName } of rows) {
      if (!task.dueDate) continue;
      const overdue = task.dueDate < today;
      const dueSoon = task.dueDate === tomorrow || task.dueDate === today;
      if (!overdue && !dueSoon) continue;
      inputs.push({
        userId,
        type: overdue ? "due_overdue" : "due_soon",
        title: overdue
        ? `Overdue: ${task.title}`
        : task.dueDate === today
          ? `Due today: ${task.title}`
          : `Due tomorrow: ${task.title}`,
        body: projectName,
        url: `/tasks/${task.id}`,
        projectId: task.projectId,
        taskId: task.id,
        dedupeKey: `${overdue ? "due_overdue" : "due_soon"}:${task.id}:${userId}:${today}`,
      });
    }
    if (inputs.length) await createNotifications(useDatabase(), inputs);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('bisz-portal:due-sweep-all'))")
      .catch(() => undefined);
    client.release();
  }
}

export async function sweepDueNotifications(userId: string) {
  if (!(await claimDueSweep(userId))) return;
  const today = localDateOnly();
  const tomorrow = addDays(today, 1);
  const rows = await useDatabase()
    .select({
      task: tasks,
      projectName: projects.name,
    })
    .from(taskMembers)
    .innerJoin(tasks, eq(taskMembers.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(taskMembers.userId, userId),
        inArray(tasks.status, ["todo", "in_review"]),
        sql`${tasks.dueDate} is not null and ${tasks.dueDate} <= ${tomorrow}`,
      ),
    )
    .limit(200);

  const inputs: NotificationInput[] = [];
  for (const { task, projectName } of rows) {
    if (!task.dueDate) continue;
    const overdue = task.dueDate < today;
    const dueSoon = task.dueDate === tomorrow || task.dueDate === today;
    if (!overdue && !dueSoon) continue;
    inputs.push({
      userId,
      type: overdue ? "due_overdue" : "due_soon",
      title: overdue
        ? `Overdue: ${task.title}`
        : task.dueDate === today
          ? `Due today: ${task.title}`
          : `Due tomorrow: ${task.title}`,
      body: projectName,
      url: `/tasks/${task.id}`,
      projectId: task.projectId,
      taskId: task.id,
      dedupeKey: `${overdue ? "due_overdue" : "due_soon"}:${task.id}:${userId}:${today}`,
    });
  }
  if (inputs.length) await createNotifications(useDatabase(), inputs);
}

export async function notificationViewsForIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await useDatabase()
    .select()
    .from(notifications)
    .where(inArray(notifications.id, ids));
  const users = await findBasisUsers(
    rows
      .map((row) => row.actorId)
      .filter((value): value is string => Boolean(value)),
  );
  return rows.map((row) => ({
    ...row,
    actor: row.actorId ? summaryUser(row.actorId, users) : null,
  }));
}

export async function cleanupNotifications() {
  const cutoff = new Date(Date.now() - 90 * 86_400_000);
  await useDatabase()
    .delete(notifications)
    .where(
      and(
        lt(notifications.createdAt, cutoff),
        isNull(notifications.readAt),
      ),
    )
    .catch(() => undefined);
  await useDatabase()
    .delete(notifications)
    .where(
      and(
        lt(notifications.createdAt, new Date(Date.now() - 180 * 86_400_000)),
        gt(notifications.createdAt, new Date(0)),
      ),
    )
    .catch(() => undefined);
}

