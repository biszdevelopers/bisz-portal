import { and, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { savedFilterUpdateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { savedFilters } from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, savedFilterUpdateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  if (body.query && JSON.stringify(body.query).length > 2048)
    return apiResult(
      event,
      new APIError("filter_too_large", "The saved filter is too large", 400, "filter_too_large"),
    );
  const [updated] = await useDatabase()
    .update(savedFilters)
    .set({ ...body, updatedAt: new Date() })
    .where(
      and(
        eq(savedFilters.id, getRouterParam(event, "filterId") ?? ""),
        eq(savedFilters.userId, auth.user.id),
      ),
    )
    .returning();
  if (!updated)
    return apiResult(
      event,
      new APIError("not_found", "Saved filter not found", 404, "not_found"),
    );
  return apiResult(
    event,
    new APIResponse({
      filter: {
        id: updated.id,
        scope: updated.scope,
        name: updated.name,
        query: updated.query,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }),
  );
});
