import { eq, inArray } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { taskUpdateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { projects, tags, taskTags, tasks } from "~/server/database/schema";
import { recordActivity } from "~/server/services/activity";
import { taskViewsFromRows } from "~/server/services/tasks";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const taskId = getRouterParam(event, "taskId") ?? "";
  const body = await parseBody(event, taskUpdateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const [existing] = await useDatabase()
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
    "updateTasks",
  );
  if (access instanceof APIError) return apiResult(event, access);

  if (body.tags?.length) {
    const found = await useDatabase()
      .select({ name: tags.name })
      .from(tags)
      .where(inArray(tags.name, body.tags));
    if (found.length !== new Set(body.tags).size)
      return apiResult(
        event,
        new APIError(
          "invalid_tags",
          "One or more tags do not exist",
          400,
          "invalid_tags",
        ),
      );
  }

  const db = useDatabase();
  const [updated] = await db
    .update(tasks)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();
  if (!updated)
    return apiResult(
      event,
      new APIError("not_found", "Task not found", 404, "not_found"),
    );

  if (body.tags) {
    await db.transaction(async (transaction) => {
      await transaction.delete(taskTags).where(eq(taskTags.taskId, taskId));
      if (body.tags?.length) {
        await transaction
          .insert(taskTags)
          .values(body.tags.map((tagName) => ({ taskId, tagName })));
      }
    });
  }

  await recordActivity(db, {
    projectId: existing.projectId,
    actorId: auth.user.id,
    type: "task_updated",
    taskId,
    metadata: {
      title: updated.title,
      fields: Object.keys(body),
    },
  });

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, existing.projectId))
    .limit(1);
  const view = (
    await taskViewsFromRows([
      { task: updated, projectName: project?.name ?? "" },
    ])
  )[0];
  return apiResult(event, new APIResponse({ task: view }));
});
