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
  if (existing.status === "in_review")
    return apiResult(
      event,
      new APIError(
        "task_in_review",
        "Return the task to do before deleting it",
        409,
        "task_in_review",
      ),
    );

  const db = useDatabase();
  await recordActivity(db, {
    projectId: existing.projectId,
    actorId: auth.user.id,
    type: "task_deleted",
    metadata: { title: existing.title, taskId: existing.id },
  });
  await db.delete(tasks).where(eq(tasks.id, taskId));
  return apiResult(event, new APIResponse({ deleted: true }));
});
