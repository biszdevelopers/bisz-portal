import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { tasks } from "~/server/database/schema";
import { recordActivity } from "~/server/services/activity";
import { lockEditableTask } from "~/server/services/tasks";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const taskId = getRouterParam(event, "taskId") ?? "";
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
  const result = await useDatabase().transaction(async (transaction) => {
    const task = await lockEditableTask(transaction, taskId);
    if (task instanceof APIError) return task;

    await transaction.delete(tasks).where(eq(tasks.id, taskId));
    await recordActivity(transaction, {
      projectId: task.projectId,
      actorId: auth.user.id,
      type: "task_deleted",
      metadata: { title: task.title, taskId: task.id },
    });
  });
  if (result instanceof APIError) return apiResult(event, result);
  return apiResult(event, new APIResponse({ deleted: true }));
});
