import { apiResult } from "~/server/utils/api-response";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { revokePortalSession } from "~/server/utils/portal-auth-tokens";

export default defineEventHandler(async (event) => {
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const session = await getUserSession(event);
  if (!session.user) {
    return apiResult(
      event,
      new APIError("invalid_session", "No session is active", 401, "invalid_session"),
    );
  }
  await revokePortalSession(event);
  return apiResult(event, new APIResponse({ signedOut: true }));
});
