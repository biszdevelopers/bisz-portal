import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import {
  commentMentions,
  comments,
  incidents,
  projectMembers,
  projects,
  tasks,
} from "~/server/database/schema";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import {
  canCommentOnTask,
  findMembership,
  projectCapabilities,
} from "~/server/utils/authorization";
import { findBasisUsers } from "~/server/utils/basis-users";
import { decodeCursor, encodeCursor } from "~/server/utils/cursor";
import type {
  CommentPage,
  CommentView,
  UserSummary,
} from "~/shared/contracts";
import { recordActivity } from "~/server/services/activity";
import { notifyCommentParticipants } from "~/server/services/notifications";

export type CommentTarget = {
  projectId: string;
  projectName: string;
  projectStatus: "active" | "archived";
  title: string;
  path: string;
} & (
  | { taskId: string; taskCreatorId: string; incidentId: null }
  | { taskId: null; incidentId: string | null }
);

export type CommentAccess = CommentTarget & {
  canRead: boolean;
  canWrite: boolean;
  canModerate: boolean;
};

export async function resolveCommentTarget(input: {
  projectId?: string;
  taskId?: string;
  incidentId?: string;
}): Promise<CommentTarget | null> {
  const targets = [input.projectId, input.taskId, input.incidentId].filter(
    Boolean,
  );
  if (targets.length !== 1) return null;
  if (input.projectId) {
    const [row] = await useDatabase()
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!row) return null;
    return {
      projectId: row.id,
      projectName: row.name,
      projectStatus: row.status,
      taskId: null,
      incidentId: null,
      title: row.name,
      path: `/projects/${row.id}`,
    };
  }
  if (input.taskId) {
    const [row] = await useDatabase()
      .select({ task: tasks, project: projects })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, input.taskId))
      .limit(1);
    if (!row) return null;
    return {
      projectId: row.project.id,
      projectName: row.project.name,
      projectStatus: row.project.status,
      taskId: row.task.id,
      taskCreatorId: row.task.creatorId,
      incidentId: null,
      title: row.task.title,
      path: `/tasks/${row.task.id}`,
    };
  }
  const [row] = await useDatabase()
    .select({ incident: incidents, project: projects })
    .from(incidents)
    .innerJoin(projects, eq(incidents.projectId, projects.id))
    .where(eq(incidents.id, input.incidentId!))
    .limit(1);
  if (!row) return null;
  return {
    projectId: row.project.id,
    projectName: row.project.name,
    projectStatus: row.project.status,
    taskId: null,
    incidentId: row.incident.id,
    title: row.incident.title,
    path: `/incidents/${row.incident.id}`,
  };
}

export async function commentAccess(
  auth: AuthenticatedRequest,
  target: CommentTarget,
): Promise<CommentAccess> {
  const membership = await findMembership(target.projectId, auth.user.id);
  if (!membership) {
    return {
      ...target,
      canRead: false,
      canWrite: false,
      canModerate: false,
    };
  }
  const capabilities = projectCapabilities(auth, membership);
  const canRead = target.taskId
    ? capabilities.readTasks
    : target.incidentId
      ? capabilities.readIncidents
      : capabilities.read;
  const canWrite = target.taskId !== null
    ? await canCommentOnTask(auth, capabilities, target.projectStatus, {
        id: target.taskId,
        creatorId: target.taskCreatorId,
      })
    : target.projectStatus === "active" &&
      (target.incidentId ? capabilities.writeIncidents : capabilities.comment);
  const canModerate = capabilities.manageMembers;
  return { ...target, canRead, canWrite, canModerate };
}

async function userSummary(
  userId: string,
  users: Map<string, { displayName: string; image: string | null } | null>,
): Promise<UserSummary | null> {
  const user = users.get(userId);
  if (!user) return null;
  return {
    id: userId,
    displayName: user.displayName,
    email: "",
    image: user.image,
  };
}

export async function listComments(
  auth: AuthenticatedRequest,
  target: CommentTarget,
  access: CommentAccess,
  input: { cursor?: string; limit?: number },
): Promise<CommentPage> {
  if (!access.canRead) return { comments: [], nextCursor: null };
  const limit = input.limit ?? 20;
  const cursor = decodeCursor(input.cursor);
  const hostCondition = target.taskId
    ? eq(comments.taskId, target.taskId)
    : target.incidentId
      ? eq(comments.incidentId, target.incidentId)
      : eq(comments.projectId, target.projectId);
  const conditions = [hostCondition];
  if (cursor) {
    conditions.push(
      or(
        lt(comments.createdAt, cursor.createdAt),
        and(
          eq(comments.createdAt, cursor.createdAt),
          lt(comments.id, cursor.id),
        ),
      )!,
    );
  }
  const rows = await useDatabase()
    .select()
    .from(comments)
    .where(and(...conditions))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit + 1);
  const pageRows = rows.slice(0, limit);
  const ids = pageRows.map((row) => row.id);
  const mentionRows = ids.length
    ? await useDatabase()
        .select()
        .from(commentMentions)
        .where(inArray(commentMentions.commentId, ids))
    : [];
  const users = await findBasisUsers([
    ...new Set([
      ...pageRows.map((row) => row.authorId),
      ...mentionRows.map((row) => row.userId),
    ]),
  ]);
  const mentionsByComment = new Map<string, string[]>();
  for (const mention of mentionRows) {
    const list = mentionsByComment.get(mention.commentId) ?? [];
    list.push(mention.userId);
    mentionsByComment.set(mention.commentId, list);
  }
  const last = pageRows.at(-1);
  return {
    comments: await Promise.all(
      pageRows.map(async (row): Promise<CommentView> => {
        const deleted = Boolean(row.deletedAt);
        return {
          id: row.id,
          authorId: row.authorId,
          author: await userSummary(row.authorId, users),
          body: deleted ? "" : row.body,
          projectId: row.projectId,
          taskId: row.taskId,
          incidentId: row.incidentId,
          mentions: await Promise.all(
            (mentionsByComment.get(row.id) ?? []).map((userId) =>
              userSummary(userId, users),
            ),
          ).then((values) =>
            values.filter((value): value is UserSummary => Boolean(value)),
          ),
          editedAt: row.editedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          canEdit:
            !deleted &&
            row.authorId === auth.user.id &&
            access.canWrite,
          canDelete:
            !deleted &&
            (row.authorId === auth.user.id || access.canModerate),
          deleted,
        };
      }),
    ),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.createdAt, last.id)
        : null,
  };
}

export async function createComment(
  auth: AuthenticatedRequest,
  target: CommentTarget,
  access: CommentAccess,
  input: { body: string; mentionIds: string[] },
) {
  if (!access.canWrite) throw new Error("comment_forbidden");
  const memberIds = await useDatabase()
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, target.projectId));
  const allowed = new Set(memberIds.map((row) => row.userId));
  const mentionIds = [...new Set(input.mentionIds)].filter((id) =>
    allowed.has(id),
  );

  const db = useDatabase();
  const [comment] = await db
    .insert(comments)
    .values({
      authorId: auth.user.id,
      body: input.body,
      projectId: target.taskId || target.incidentId ? null : target.projectId,
      taskId: target.taskId,
      incidentId: target.incidentId,
    })
    .returning();
  if (!comment) throw new Error("comment_failed");
  if (mentionIds.length) {
    await db
      .insert(commentMentions)
      .values(mentionIds.map((userId) => ({ commentId: comment.id, userId })))
      .onConflictDoNothing();
  }

  await recordActivity(db, {
    projectId: target.projectId,
    actorId: auth.user.id,
    type: "comment_created",
    taskId: target.taskId,
    incidentId: target.incidentId,
    commentId: comment.id,
    metadata: { excerpt: input.body.slice(0, 140) },
  });

  const participants = await db
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(
      and(
        target.taskId
          ? eq(comments.taskId, target.taskId)
          : target.incidentId
            ? eq(comments.incidentId, target.incidentId)
            : eq(comments.projectId, target.projectId),
        isNull(comments.deletedAt),
        sql`${comments.id} <> ${comment.id}`,
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(50);
  await notifyCommentParticipants({
    actorId: auth.user.id,
    commentId: comment.id,
    projectId: target.projectId,
    taskId: target.taskId,
    incidentId: target.incidentId,
    title: target.title,
    url: `${target.path}#comment-${comment.id}`,
    mentionIds,
    participantIds: participants.map((row) => row.authorId),
  });

  return comment;
}

export async function updateComment(
  auth: AuthenticatedRequest,
  commentId: string,
  body: string,
) {
  const [row] = await useDatabase()
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row || row.deletedAt) return null;
  const target = await resolveCommentTarget({
    projectId: row.projectId ?? undefined,
    taskId: row.taskId ?? undefined,
    incidentId: row.incidentId ?? undefined,
  });
  if (!target) return null;
  const access = await commentAccess(auth, target);
  if (row.authorId !== auth.user.id || !access.canWrite) return null;
  const [updated] = await useDatabase()
    .update(comments)
    .set({ body, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(comments.id, commentId))
    .returning();
  await recordActivity(useDatabase(), {
    projectId: target.projectId,
    actorId: auth.user.id,
    type: "comment_updated",
    taskId: target.taskId,
    incidentId: target.incidentId,
    commentId,
  });
  return updated ?? null;
}

export async function deleteComment(
  auth: AuthenticatedRequest,
  commentId: string,
) {
  const [row] = await useDatabase()
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row || row.deletedAt) return null;
  const target = await resolveCommentTarget({
    projectId: row.projectId ?? undefined,
    taskId: row.taskId ?? undefined,
    incidentId: row.incidentId ?? undefined,
  });
  if (!target) return null;
  const access = await commentAccess(auth, target);
  if (row.authorId !== auth.user.id && !access.canModerate) return null;
  const [updated] = await useDatabase()
    .update(comments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(comments.id, commentId))
    .returning();
  await recordActivity(useDatabase(), {
    projectId: target.projectId,
    actorId: auth.user.id,
    type: "comment_deleted",
    taskId: target.taskId,
    incidentId: target.incidentId,
    commentId,
  });
  return updated ?? null;
}
