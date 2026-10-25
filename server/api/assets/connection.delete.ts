import { apiResult } from "~/server/utils/api-response";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { disconnectAssets, portalAssetUser } from "~/server/utils/assets-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";

export default defineEventHandler(async (event) => {
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const userId = await portalAssetUser(event);
  if (!userId) {
    return apiResult(
      event,
      new APIError(
        "invalid_session",
        "Portal sign-in required",
        401,
        "invalid_session",
      ),
    );
  }

  await disconnectAssets(userId);
  return apiResult(event, new APIResponse({ disconnected: true }));
});
