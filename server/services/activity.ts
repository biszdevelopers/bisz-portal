import { desc, lt, or, eq, and, inArray, sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import {
  activityEvents,
  type ActivityRow,
} from "~/server/database/schema";
import { findBasisUsers } from "~/server/utils/basis-users";
import { decodeCursor, encodeCursor } from "~/server/utils/cursor";
import type {
  ActivityPage,
  ActivityView,
  UserSummary,
} from "~/shared/contracts";

type DbClient = ReturnType<typeof useDatabase>;
type TransactionClient = Parameters<
  Parameters<DbClient["transaction"]>[0]
>[0];
export type DatabaseWriter = DbClient | TransactionClient;

export type ActivityInput = {
  projectId?: string | null;
  actorId: string;
  type:
    | "project_created"
    | "project_updated"
    | "project_archived"
    | "project_unarchived"
    | "member_added"
    | "member_removed"
    | "member_permissions_changed"
    | "task_created"
    | "task_updated"
    | "task_status_changed"
    | "task_deleted"
    | "task_duplicated"
    | "task_members_added"
    | "task_members_removed"
    | "task_tags_changed"
    | "incident_created"
    | "incident_updated"
    | "incident_status_changed"
    | "incident_assigned"
    | "incident_resolved"
    | "comment_created"
    | "comment_updated"
    | "comment_deleted"
    | "asset_link_repaired"
    | "template_created"
    | "template_applied";
  taskId?: string | null;
  incidentId?: string | null;
  commentId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordActivity(
  db: DatabaseWriter,
  input: ActivityInput,
) {
  await db.insert(activityEvents).values({
    projectId: input.projectId ?? null,
    actorId: input.actorId,
    type: input.type,
    taskId: input.taskId ?? null,
    incidentId: input.incidentId ?? null,
    commentId: input.commentId ?? null,
    metadata: input.metadata ?? {},
  });
}

function userSummary(
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

export function activityView(
  row: ActivityRow,
  users: Map<string, { displayName: string; image: string | null } | null>,
): ActivityView {
  return {
    id: row.id,
    projectId: row.projectId,
    actorId: row.actorId,
    actor: userSummary(row.actorId, users),
    type: row.type,
    taskId: row.taskId,
    incidentId: row.incidentId,
    commentId: row.commentId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function activityViews(rows: ActivityRow[]) {
  const users = await findBasisUsers(rows.map((row) => row.actorId));
  return rows.map((row) => activityView(row, users));
}

export async function listActivity(input: {
  projectIds: string[];
  projectId?: string;
  taskId?: string;
  incidentId?: string;
  cursor?: string;
  limit?: number;
}): Promise<ActivityPage> {
  const limit = input.limit ?? 20;
  const cursor = decodeCursor(input.cursor);
  const conditions = [];
  if (input.projectId) conditions.push(eq(activityEvents.projectId, input.projectId));
  else if (input.projectIds.length)
    conditions.push(inArray(activityEvents.projectId, input.projectIds));
  else conditions.push(sql`false`);
  if (input.taskId) conditions.push(eq(activityEvents.taskId, input.taskId));
  if (input.incidentId)
    conditions.push(eq(activityEvents.incidentId, input.incidentId));
  if (cursor) {
    conditions.push(
      or(
        lt(activityEvents.createdAt, cursor.createdAt),
        and(
          eq(activityEvents.createdAt, cursor.createdAt),
          lt(activityEvents.id, cursor.id),
        ),
      ),
    );
  }

  const rows = await useDatabase()
    .select()
    .from(activityEvents)
    .where(and(...conditions))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    activity: await activityViews(pageRows),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.createdAt, last.id)
        : null,
  };
}
