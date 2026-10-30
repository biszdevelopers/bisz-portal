import { eq } from "drizzle-orm";
import { tags } from "~/server/database/schema";
import { useDatabase } from "~/server/database/client";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { parseBody } from "~/server/utils/request";
import { tagDeleteSchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tags.delete,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const body = await parseBody(event, tagDeleteSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const [deleted] = await useDatabase()
    .delete(tags)
    .where(eq(tags.name, body.name))
    .returning({ name: tags.name });

  if (!deleted) {
    return apiResult(
      event,
      new APIError("not_found", "Tag not found", 404, "not_found"),
    );
  }

  return apiResult(
    event,
    new APIResponse({ deleted: true, name: deleted.name }),
  );
});
