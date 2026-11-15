import { authenticateRequest } from "~/server/utils/api-auth";
import { apiResult } from "~/server/utils/api-response";
import { basisApplicationsRequest, requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";

export default defineEventHandler(async (event) => {
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);

  const userId = encodeURIComponent(getRouterParam(event, "userId") ?? "");
  const sessionId = encodeURIComponent(getRouterParam(event, "sessionId") ?? "");
  const result = await basisApplicationsRequest(
    auth, `/management/users/${userId}/sessions/${sessionId}`, { method: "DELETE" },
  );
  if (result instanceof APIError) return apiResult(event, result);
  return apiResult(event, new APIResponse({ ended: true }));
});
