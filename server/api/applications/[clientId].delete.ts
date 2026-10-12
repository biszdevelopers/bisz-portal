import { PortalPermissions } from "~/shared/permissions";
import { apiResult } from "~/server/utils/api-response";
import { requireApplicationRequest } from "~/server/utils/application-route";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";

export default defineEventHandler(async (event) => {
  const auth = await requireApplicationRequest(
    event,
    PortalPermissions.BiszPortal.Applications.delete,
    true,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const id = encodeURIComponent(getRouterParam(event, "clientId") ?? "");
  const result = await basisApplicationsRequest<{
    deleted: boolean;
    clientId: string;
  }>(auth, `/applications/${id}`, { method: "DELETE" });
  return apiResult(
    event,
    result instanceof APIError ? result : new APIResponse(result),
  );
});
