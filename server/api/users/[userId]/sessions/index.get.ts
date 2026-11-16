import type { UserAuthorizationSession } from "~/shared/contracts";
import { authenticateRequest } from "~/server/utils/api-auth";
import { apiResult } from "~/server/utils/api-response";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);

  const userId = encodeURIComponent(getRouterParam(event, "userId") ?? "");
  const result = await basisApplicationsRequest<{ sessions: UserAuthorizationSession[] }>(
    auth, `/management/users/${userId}/sessions`,
  );
  return apiResult(event, result instanceof APIError ? result : new APIResponse(result));
});
