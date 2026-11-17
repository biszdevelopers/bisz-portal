import { asc, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { useDatabase } from "~/server/database/client";
import { taskTemplates } from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "readTasks");
  if (access instanceof APIError) return apiResult(event, access);
  const rows = await useDatabase()
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.projectId, projectId))
    .orderBy(asc(taskTemplates.name));
  return apiResult(
    event,
    new APIResponse({
      templates: rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        title: row.title,
        description: row.description,
        dueOffsetDays: row.dueOffsetDays,
        tags: row.tags,
        memberIds: row.memberIds,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    }),
  );
});
