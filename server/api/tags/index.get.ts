import { asc, inArray, sql } from "drizzle-orm";
import { tags } from "~/server/database/schema";
import { useDatabase } from "~/server/database/client";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { escapeTagLikePattern } from "~/server/utils/tags";
import { tagQuerySchema, type TagView } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";

const SEARCH_LIMIT = 20;

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tags.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const query = tagQuerySchema.safeParse(getQuery(event));
  if (!query.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        query.error.issues[0]?.message ?? "Invalid tag query",
        400,
        "invalid_request",
      ),
    );
  }

  if ("name" in query.data) {
    const uniqueNames = [...new Set(query.data.name)];
    const rows = await useDatabase()
      .select({ name: tags.name, color: tags.color })
      .from(tags)
      .where(inArray(tags.name, uniqueNames))
      .orderBy(asc(tags.name));
    return apiResult(
      event,
      new APIResponse({ tags: rows satisfies TagView[], hasMore: false }),
    );
  }

  const escaped = escapeTagLikePattern(query.data.q);
  const contains = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const rows = await useDatabase()
    .select({ name: tags.name, color: tags.color })
    .from(tags)
    .where(sql`${tags.name} like ${contains} escape '\\'`)
    .orderBy(
      sql`case when ${tags.name} like ${prefix} escape '\\' then 0 else 1 end`,
      asc(tags.name),
    )
    .limit(SEARCH_LIMIT + 1);

  return apiResult(
    event,
    new APIResponse({
      tags: rows.slice(0, SEARCH_LIMIT) satisfies TagView[],
      hasMore: rows.length > SEARCH_LIMIT,
    }),
  );
});
