import { and, eq, inArray } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { taskBulkSchema, type TaskBulkResult } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import {
  projectMembers,
  projects,
  tags,
  taskMembers,
  taskTags,
  tasks,
} from "~/server/database/schema";
import { projectCapabilities } from "~/server/utils/authorization";
import { recordActivity } from "~/server/services/activity";
import { createNotifications } from "~/server/services/notifications";
import { lockEditableTask } from "~/server/services/tasks";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, taskBulkSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const db = useDatabase();
  const rows = await db
    .select({ task: tasks, projectName: projects.name })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(inArray(tasks.id, body.taskIds))
    .orderBy(tasks.id);
  const projectIds = [...new Set(rows.map((row) => row.task.projectId))];
  const memberships = projectIds.length
    ? await db
        .select()
        .from(projectMembers)
        .where(
          and(
            inArray(projectMembers.projectId, projectIds),
            eq(projectMembers.userId, auth.user.id),
          ),
        )
    : [];
  const membershipByProject = new Map(
    memberships.map((membership) => [membership.projectId, membership]),
  );
  const result: TaskBulkResult = { updated: [], skipped: [] };
  const permitted = rows.filter(({ task }) => {
    const membership = membershipByProject.get(task.projectId);
    if (!membership) {
      result.skipped.push({ id: task.id, reason: "No project access" });
      return false;
    }
    const capabilities = projectCapabilities(auth, membership);
    if (!capabilities.updateTasks) {
      result.skipped.push({ id: task.id, reason: "Task update is not allowed" });
      return false;
    }
    return true;
  });
  if (!permitted.length) return apiResult(event, new APIResponse(result));

  if (body.action === "add-tag") {
    const [tag] = await db
      .select({ name: tags.name })
      .from(tags)
      .where(eq(tags.name, body.value))
      .limit(1);
    if (!tag)
      return apiResult(
        event,
        new APIError("invalid_tag", "The tag does not exist", 400, "invalid_tag"),
      );
  }

  if (body.action === "assign") {
    const assigneeMemberships = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, body.value));
    const allowed = new Set(
      assigneeMemberships.map((membership) => membership.projectId),
    );
    for (const { task } of permitted) {
      if (!allowed.has(task.projectId)) {
        result.skipped.push({
          id: task.id,
          reason: "The assignee is not a project member",
        });
      }
    }
  }

  const targets = permitted.filter(
    ({ task }) => !result.skipped.some((skipped) => skipped.id === task.id),
  );

  await db.transaction(async (transaction) => {
    for (const { task: target, projectName } of targets) {
      const task = await lockEditableTask(transaction, target.id);
      if (task instanceof APIError) {
        result.skipped.push({ id: target.id, reason: task.message });
        continue;
      }
      if (body.action === "status") {
        await transaction
          .update(tasks)
          .set({ status: body.value, updatedAt: new Date() })
          .where(eq(tasks.id, task.id));
        await recordActivity(transaction, {
          projectId: task.projectId,
          actorId: auth.user.id,
          type: "task_status_changed",
          taskId: task.id,
          metadata: { from: task.status, to: body.value, title: task.title },
        });
      } else if (body.action === "add-tag") {
        await transaction
          .insert(taskTags)
          .values({ taskId: task.id, tagName: body.value })
          .onConflictDoNothing();
        await recordActivity(transaction, {
          projectId: task.projectId,
          actorId: auth.user.id,
          type: "task_tags_changed",
          taskId: task.id,
          metadata: { added: body.value, title: task.title },
        });
      } else if (body.action === "remove-tag") {
        await transaction
          .delete(taskTags)
          .where(
            and(
              eq(taskTags.taskId, task.id),
              eq(taskTags.tagName, body.value),
            ),
          );
        await recordActivity(transaction, {
          projectId: task.projectId,
          actorId: auth.user.id,
          type: "task_tags_changed",
          taskId: task.id,
          metadata: { removed: body.value, title: task.title },
        });
      } else if (body.action === "assign") {
        await transaction
          .insert(taskMembers)
          .values({ taskId: task.id, userId: body.value })
          .onConflictDoNothing();
        await recordActivity(transaction, {
          projectId: task.projectId,
          actorId: auth.user.id,
          type: "task_members_added",
          taskId: task.id,
          metadata: { userId: body.value, title: task.title },
        });
        if (body.value !== auth.user.id) {
          await createNotifications(transaction, [
            {
              userId: body.value,
              type: "task_assigned",
              title: `Assigned task: ${task.title}`,
              body: projectName,
              url: `/tasks/${task.id}`,
              projectId: task.projectId,
              taskId: task.id,
              actorId: auth.user.id,
              dedupeKey: `task_assigned:${task.id}:${body.value}`,
            },
          ]);
        }
      } else if (body.action === "unassign") {
        await transaction
          .delete(taskMembers)
          .where(
            and(
              eq(taskMembers.taskId, task.id),
              eq(taskMembers.userId, body.value),
            ),
          );
        await recordActivity(transaction, {
          projectId: task.projectId,
          actorId: auth.user.id,
          type: "task_members_removed",
          taskId: task.id,
          metadata: { userId: body.value, title: task.title },
        });
      }
      result.updated.push(task.id);
    }
  });

  return apiResult(event, new APIResponse(result));
});
