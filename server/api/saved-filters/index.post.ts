import { and, count, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { savedFilterCreateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { savedFilters } from "~/server/database/schema";

const MAX_PER_SCOPE = 10;

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, savedFilterCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  if (JSON.stringify(body.query).length > 2048)
    return apiResult(
      event,
      new APIError(
        "filter_too_large",
        "The saved filter is too large",
        400,
        "filter_too_large",
      ),
    );
  const db = useDatabase();
  const [total] = await db
    .select({ value: count() })
    .from(savedFilters)
    .where(
      and(
        eq(savedFilters.userId, auth.user.id),
        eq(savedFilters.scope, body.scope),
      ),
    );
  if (Number(total?.value ?? 0) >= MAX_PER_SCOPE)
    return apiResult(
      event,
      new APIError(
        "too_many_filters",
        "Delete a saved filter first",
        409,
        "too_many_filters",
      ),
    );
  const [created] = await db
    .insert(savedFilters)
    .values({
      userId: auth.user.id,
      scope: body.scope,
      name: body.name,
      query: body.query,
    })
    .onConflictDoNothing({
      target: [savedFilters.userId, savedFilters.scope, savedFilters.name],
    })
    .returning();
  if (!created)
    return apiResult(
      event,
      new APIError(
        "filter_exists",
        "A filter with this name already exists",
        409,
        "filter_exists",
      ),
    );
  return apiResult(
    event,
    new APIResponse({
      filter: {
        id: created.id,
        scope: created.scope,
        name: created.name,
        query: created.query,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    }, 201),
  );
});
