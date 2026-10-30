import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { useDatabase } from "../server/database/client";
import { projectMembers, projects, tasks } from "../server/database/schema";
import { getProjectDetail } from "../server/services/projects";
import type { AuthenticatedRequest } from "../server/utils/api-auth";
import { PortalPermissions, ProjectPermissions } from "../shared/permissions";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("project task visibility", () => {
  test("does not disclose task records without task-read access", async () => {
    const db = useDatabase();
    const projectId = randomUUID();
    const userId = randomUUID();

    try {
      await db.transaction(async (transaction) => {
        await transaction.insert(projects).values({
          id: projectId,
          name: "Visibility test",
          slug: `visibility-${projectId}`,
          creatorId: userId,
        });
        await transaction.insert(projectMembers).values({
          projectId,
          userId,
          role: "owner",
          permissions: [ProjectPermissions.projectRead],
        });
        await transaction.insert(tasks).values({
          projectId,
          title: "Hidden task",
          description: "This description must not be returned.",
        });
      });

      const auth: AuthenticatedRequest = {
        accessToken: "test",
        claims: {
          sub: userId,
          permissions: [PortalPermissions.BiszPortal.Projects.read],
        } as AuthenticatedRequest["claims"],
        user: { id: userId, name: "Test user", image: null },
      };
      const project = await getProjectDetail(auth, projectId);

      expect(project?.taskCount).toBe(1);
      expect(project?.capabilities.readTasks).toBe(false);
      expect(project?.tasks).toEqual([]);
    } finally {
      await db.transaction(async (transaction) => {
        await transaction.delete(tasks).where(eq(tasks.projectId, projectId));
        await transaction
          .delete(projectMembers)
          .where(eq(projectMembers.projectId, projectId));
        await transaction.delete(projects).where(eq(projects.id, projectId));
      });
    }
  });
});
