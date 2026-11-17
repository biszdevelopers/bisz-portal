import { asc, eq, and } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { savedFilterScopeSchema } from "~/shared/contracts";
import { useDatabase } from "~/server/database/client";
import { savedFilters } from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const scope = savedFilterScopeSchema.safeParse(getQuery(event).scope);
  if (!scope.success)
    return apiResult(
      event,
      new APIError("invalid_request", "Invalid filter scope", 400, "invalid_request"),
    );
  const rows = await useDatabase()
    .select()
    .from(savedFilters)
    .where(
      and(
        eq(savedFilters.userId, auth.user.id),
        eq(savedFilters.scope, scope.data),
      ),
    )
    .orderBy(asc(savedFilters.name));
  return apiResult(
    event,
    new APIResponse({
      filters: rows.map((row) => ({
        id: row.id,
        scope: row.scope,
        name: row.name,
        query: row.query,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    }),
  );
});
