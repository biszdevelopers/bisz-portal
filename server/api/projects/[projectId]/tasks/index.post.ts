import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import {
  projects,
  projectMembers,
  tags as tagCatalog,
  tasks,
  taskMembers,
  taskTags,
} from "~/server/database/schema";
import { parseBody } from "~/server/utils/request";
import {
  taskCreateSchema,
  type TagView,
  type TaskView,
} from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { findBasisUser } from "~/server/utils/basis-users";
import { recordActivity } from "~/server/services/activity";
import { createNotifications } from "~/server/services/notifications";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const projectId = getRouterParam(event, "projectId") ?? "";
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiResult(
      event,
      new APIError("not_found", "Project not found", 404, "not_found"),
    );
  }
  const access = await requireProjectCapability(auth, projectId, "createTasks");
  if (access instanceof APIError) return apiResult(event, access);

  const body = await parseBody(event, taskCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  const memberUsers = new Map(
    await Promise.all(
      body.memberIds.map(async (userId) => [userId, await findBasisUser(userId)] as const),
    ),
  );
  if (body.memberIds.some((userId) => !memberUsers.get(userId))) {
    return apiResult(
      event,
      new APIError(
        "invalid_task_members",
        "One or more selected users do not exist or are disabled",
        400,
        "invalid_task_members",
      ),
    );
  }

  const result = await useDatabase().transaction(async (transaction) => {
    const [project] = await transaction
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .for("update");

    if (!project) {
      return new APIError("not_found", "Project not found", 404, "not_found");
    }
    if (project.status === "archived") {
      return new APIError(
        "project_archived",
        "Archived projects cannot receive new tasks",
        409,
        "project_archived",
      );
    }

    let selectedTags: TagView[] = [];
    if (body.tags.length) {
      const tagRows = await transaction
        .select({ name: tagCatalog.name, color: tagCatalog.color })
        .from(tagCatalog)
        .where(inArray(tagCatalog.name, body.tags))
        .for("key share");
      if (tagRows.length !== body.tags.length) {
        return new APIError(
          "invalid_task_tags",
          "One or more selected tags no longer exist",
          400,
          "invalid_task_tags",
        );
      }
      const byName = new Map(tagRows.map((tag) => [tag.name, tag]));
      selectedTags = body.tags.map((name) => byName.get(name)!);
    }

    if (body.memberIds.length) {
      const memberships = await transaction
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, project.id),
            inArray(projectMembers.userId, body.memberIds),
          ),
        )
        .for("key share");
      if (memberships.length !== body.memberIds.length) {
        return new APIError(
          "invalid_task_members",
          "Task members must already belong to this project",
          400,
          "invalid_task_members",
        );
      }
    }

    const [created] = await transaction
      .insert(tasks)
      .values({
        projectId: project.id,
        creatorId: auth.user.id,
        title: body.title,
        description: body.description,
        dueDate: body.dueDate,
      })
      .returning();
    if (!created) throw new Error("Task creation failed");

    if (selectedTags.length) {
      await transaction.insert(taskTags).values(
        selectedTags.map((tag) => ({
          taskId: created.id,
          tagName: tag.name,
        })),
      );
    }
    if (body.memberIds.length) {
      await transaction.insert(taskMembers).values(
        body.memberIds.map((userId) => ({ taskId: created.id, userId })),
      );
    }

    await transaction
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    await recordActivity(transaction, {
      projectId: project.id,
      actorId: auth.user.id,
      type: "task_created",
      taskId: created.id,
      metadata: { title: created.title },
    });
    const assigned = body.memberIds.filter(
      (userId) => userId !== auth.user.id,
    );
    if (assigned.length) {
      await createNotifications(
        transaction,
        assigned.map((userId) => ({
          userId,
          type: "task_assigned" as const,
          title: `Assigned task: ${created.title}`,
          body: project.name,
          url: `/tasks/${created.id}`,
          projectId: project.id,
          taskId: created.id,
          actorId: auth.user.id,
          dedupeKey: `task_assigned:${created.id}:${userId}`,
        })),
      );
    }

    const task: TaskView = {
      id: created.id,
      projectId: created.projectId,
      creatorId: created.creatorId,
      projectName: project.name,
      title: created.title,
      description: created.description,
      status: created.status,
      dueDate: created.dueDate,
      tags: selectedTags,
      members: body.memberIds.map((userId) => {
        const user = memberUsers.get(userId)!;
        return {
          userId,
          displayName: user.displayName,
          image: user.image,
          role: "assignee" as const,
        };
      }),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
    return task;
  });

  if (result instanceof APIError) return apiResult(event, result);
  return apiResult(event, new APIResponse({ task: result }, 201));
});
