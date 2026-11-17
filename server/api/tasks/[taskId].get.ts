import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import {
  canCommentOnTask,
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { useDatabase } from "~/server/database/client";
import { projects, tasks } from "~/server/database/schema";
import { taskTagViewsByTaskId } from "~/server/services/task-tags";
import { taskMemberViewsByTaskId } from "~/server/services/task-members";
import type { TaskActions } from "~/shared/contracts";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const taskId = getRouterParam(event, "taskId") ?? "";
  if (!z.string().uuid().safeParse(taskId).success) {
    return apiResult(
      event,
      new APIError("not_found", "Task not found", 404, "not_found"),
    );
  }
  const [row] = await useDatabase()
    .select({
      task: tasks,
      projectName: projects.name,
      projectStatus: projects.status,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row)
    return apiResult(
      event,
      new APIError("not_found", "Task not found", 404, "not_found"),
    );
  const access = await requireProjectCapability(
    auth,
    row.task.projectId,
    "readTasks",
  );
  if (access instanceof APIError)
    return apiResult(
      event,
      new APIError("not_found", "Task not found", 404, "not_found"),
    );
  const tagsByTaskId = await taskTagViewsByTaskId([row.task.id]);
  const membersByTaskId = await taskMemberViewsByTaskId([row.task.id]);
  const taskMembers = membersByTaskId.get(row.task.id) ?? [];
  const canSubmit =
    row.task.creatorId === auth.user.id ||
    taskMembers.some((member) => member.userId === auth.user.id);
  const canEdit =
    row.projectStatus === "active" &&
    row.task.status !== "in_review" &&
    access.capabilities.updateTasks;
  const actions: TaskActions = {
    submitForReview:
      row.task.status === "todo" &&
      canSubmit &&
      row.projectStatus === "active",
    review:
      row.task.status === "in_review" &&
      row.projectStatus === "active" &&
      access.capabilities.updateTasks,
    manageMembers:
      row.task.status === "todo" && canEdit,
    edit: canEdit,
    delete: canEdit,
    duplicate:
      row.projectStatus === "active" &&
      access.capabilities.createTasks,
    comment: await canCommentOnTask(auth, access.capabilities, row.projectStatus, row.task),
  };
  return apiResult(
    event,
    new APIResponse({
      task: {
        id: row.task.id,
        projectId: row.task.projectId,
        creatorId: row.task.creatorId,
        projectName: row.projectName,
        title: row.task.title,
        description: row.task.description,
        status: row.task.status,
        dueDate: row.task.dueDate,
        tags: tagsByTaskId.get(row.task.id) ?? [],
        members: taskMembers,
        createdAt: row.task.createdAt.toISOString(),
        updatedAt: row.task.updatedAt.toISOString(),
      },
      actions,
    }),
  );
});
