import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { taskDuplicateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import {
  projects,
  taskMembers,
  taskTags,
  tasks,
} from "~/server/database/schema";
import { recordActivity } from "~/server/services/activity";
import { taskViewsFromRows } from "~/server/services/tasks";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const taskId = getRouterParam(event, "taskId") ?? "";
  const body = await parseBody(event, taskDuplicateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const db = useDatabase();
  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!existing)
    return apiResult(
      event,
      new APIError("not_found", "Task not found", 404, "not_found"),
    );
  const access = await requireProjectCapability(
    auth,
    existing.projectId,
    "createTasks",
  );
  if (access instanceof APIError) return apiResult(event, access);

  const title = (body.title ?? `${existing.title} copy`).slice(0, 120);
  const [created] = await db
    .insert(tasks)
    .values({
      projectId: existing.projectId,
      creatorId: auth.user.id,
      title,
      description: existing.description,
      status: "todo",
      dueDate: existing.dueDate,
    })
    .returning();
  if (!created)
    return apiResult(
      event,
      new APIError("duplicate_failed", "The task could not be duplicated", 500, "duplicate_failed"),
    );

  await db.transaction(async (transaction) => {
    const tagRows = await transaction
      .select({ tagName: taskTags.tagName })
      .from(taskTags)
      .where(eq(taskTags.taskId, taskId));
    if (tagRows.length) {
      await transaction
        .insert(taskTags)
        .values(tagRows.map((row) => ({ taskId: created.id, tagName: row.tagName })));
    }
    const memberRows = await transaction
      .select({ userId: taskMembers.userId })
      .from(taskMembers)
      .where(eq(taskMembers.taskId, taskId));
    if (memberRows.length) {
      await transaction
        .insert(taskMembers)
        .values(memberRows.map((row) => ({ taskId: created.id, userId: row.userId })));
    }
  });

  await recordActivity(db, {
    projectId: existing.projectId,
    actorId: auth.user.id,
    type: "task_duplicated",
    taskId: created.id,
    metadata: { sourceTaskId: taskId, title: created.title },
  });

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, existing.projectId))
    .limit(1);
  const view = (
    await taskViewsFromRows([
      { task: created, projectName: project?.name ?? "" },
    ])
  )[0];
  return apiResult(event, new APIResponse({ task: view }, 201));
});
