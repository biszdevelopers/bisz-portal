import { and, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { savedFilters } from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const [deleted] = await useDatabase()
    .delete(savedFilters)
    .where(
      and(
        eq(savedFilters.id, getRouterParam(event, "filterId") ?? ""),
        eq(savedFilters.userId, auth.user.id),
      ),
    )
    .returning({ id: savedFilters.id });
  if (!deleted)
    return apiResult(
      event,
      new APIError("not_found", "Saved filter not found", 404, "not_found"),
    );
  return apiResult(event, new APIResponse({ deleted: true }));
});
