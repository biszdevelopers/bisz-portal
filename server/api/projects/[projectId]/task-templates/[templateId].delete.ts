import { and, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { taskTemplates } from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "updateTasks");
  if (access instanceof APIError) return apiResult(event, access);
  const [deleted] = await useDatabase()
    .delete(taskTemplates)
    .where(
      and(
        eq(taskTemplates.id, getRouterParam(event, "templateId") ?? ""),
        eq(taskTemplates.projectId, projectId),
      ),
    )
    .returning({ id: taskTemplates.id });
  if (!deleted)
    return apiResult(
      event,
      new APIError("not_found", "Template not found", 404, "not_found"),
    );
  return apiResult(event, new APIResponse({ deleted: true }));
});
