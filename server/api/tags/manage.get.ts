import { asc, count, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { useDatabase } from "~/server/database/client";
import { taskTags, tags } from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tags.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const rows = await useDatabase()
    .select({
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      usageCount: count(taskTags.taskId),
    })
    .from(tags)
    .leftJoin(taskTags, eq(taskTags.tagName, tags.name))
    .groupBy(tags.name, tags.color, tags.createdAt)
    .orderBy(asc(tags.name));
  return apiResult(
    event,
    new APIResponse({
      tags: rows.map((row) => ({
        name: row.name,
        color: row.color,
        usageCount: Number(row.usageCount),
        createdAt: row.createdAt.toISOString(),
      })),
    }),
  );
});
