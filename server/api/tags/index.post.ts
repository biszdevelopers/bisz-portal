import { tags } from "~/server/database/schema";
import { useDatabase } from "~/server/database/client";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { parseBody } from "~/server/utils/request";
import { tagCreateSchema, type TagView } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tags.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const body = await parseBody(event, tagCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const [created] = await useDatabase()
    .insert(tags)
    .values({ ...body, creatorId: auth.user.id })
    .onConflictDoNothing({ target: tags.name })
    .returning({ name: tags.name, color: tags.color });

  if (!created) {
    return apiResult(
      event,
      new APIError(
        "tag_exists",
        "A tag with this name already exists",
        409,
        "tag_exists",
      ),
    );
  }

  return apiResult(
    event,
    new APIResponse({ tag: created satisfies TagView }, 201),
  );
});
