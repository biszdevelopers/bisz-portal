import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { databasePool, useDatabase } from "../server/database/client";
import { projectMembers, projects, taskMembers, tasks } from "../server/database/schema";
import { commentAccess, resolveCommentTarget } from "../server/services/comments";
import type { AuthenticatedRequest } from "../server/utils/api-auth";
import { defaultProjectMemberPermissions, PortalPermissions } from "../shared/permissions";

const hasDatabase = Boolean(process.env.DATABASE_URL) &&
  (await databasePool().query("select 1").then(() => true).catch(() => false));
const { Projects, Tasks } = PortalPermissions.BiszPortal;

function auth(userId: string, permissions: string[]): AuthenticatedRequest {
  return {
    accessToken: "test",
    claims: { sub: userId, permissions } as AuthenticatedRequest["claims"],
    user: { id: userId, name: "Test user", image: null },
  };
}

test.skipIf(!hasDatabase)("authorizes comments by scope, membership, read access, and project status", async () => {
  const db = useDatabase();
  const projectId = randomUUID();
  const taskId = randomUUID();
  const ownerId = randomUUID();
  const assigneeId = randomUUID();
  const memberId = randomUUID();

  try {
    await db.transaction(async (transaction) => {
      await transaction.insert(projects).values({
        id: projectId,
        name: "Comment permissions test",
        slug: `comments-${projectId}`,
        creatorId: ownerId,
      });
      await transaction.insert(projectMembers).values([
        { projectId, userId: ownerId, role: "owner", permissions: [] },
        ...[assigneeId, memberId].map((userId) => ({
          projectId, userId, permissions: defaultProjectMemberPermissions,
        })),
      ]);
      await transaction.insert(tasks).values({ id: taskId, projectId, creatorId: ownerId, title: "Test task" });
      await transaction.insert(taskMembers).values({ taskId, userId: assigneeId });
    });

    const project = (await resolveCommentTarget({ projectId }))!;
    const task = (await resolveCommentTarget({ taskId }))!;
    const caseFor = (userId: string, ...grants: string[]) =>
      auth(userId, [Projects.read, Tasks.read, ...grants]);

    expect(await commentAccess(caseFor(ownerId, Projects.comment.me), project)).toMatchObject({ canWrite: true });
    expect(await commentAccess(caseFor(ownerId, Projects.comment.others), project)).toMatchObject({ canWrite: false });
    expect(await commentAccess(caseFor(memberId, Projects.comment.me), project)).toMatchObject({ canWrite: false });
    expect(await commentAccess(caseFor(memberId, Projects.comment.others), project)).toMatchObject({ canWrite: true });

    expect(await commentAccess(caseFor(ownerId, Tasks.comment.me), task)).toMatchObject({ canWrite: true });
    expect(await commentAccess(caseFor(assigneeId, Tasks.comment.me), task)).toMatchObject({ canWrite: true });
    expect(await commentAccess(caseFor(assigneeId, Tasks.comment.others), task)).toMatchObject({ canWrite: false });
    expect(await commentAccess(caseFor(memberId, Tasks.comment.me), task)).toMatchObject({ canWrite: false });
    expect(await commentAccess(caseFor(memberId, Tasks.comment.others), task)).toMatchObject({ canWrite: true });
    expect(await commentAccess(caseFor(memberId, Projects.comment.others, Tasks.update), task)).toMatchObject({ canRead: true, canWrite: false });
    expect(await commentAccess(auth(memberId, [Projects.read, Tasks.comment.others]), task)).toMatchObject({ canRead: false, canWrite: false });
    expect(await commentAccess(auth(randomUUID(), ["BiszPortal.all"]), task)).toMatchObject({ canRead: false, canWrite: false });
    expect(await commentAccess(caseFor(memberId, "BiszPortal.Tasks.comment.all"), task)).toMatchObject({ canWrite: true });
    expect(await commentAccess(caseFor(memberId, Tasks.comment.others), { ...task, projectStatus: "archived" })).toMatchObject({ canRead: true, canWrite: false });
  } finally {
    await db.transaction(async (transaction) => {
      await transaction.delete(tasks).where(eq(tasks.projectId, projectId));
      await transaction.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
      await transaction.delete(projects).where(eq(projects.id, projectId));
    });
  }
});
