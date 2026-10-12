import type { ApplicationDetail } from "~/shared/contracts";
import { applicationCreateSchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { apiResult } from "~/server/utils/api-response";
import { requireApplicationRequest } from "~/server/utils/application-route";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { parseBody } from "~/server/utils/request";

export default defineEventHandler(async (event) => {
  const auth = await requireApplicationRequest(
    event,
    PortalPermissions.BiszPortal.Applications.create,
    true,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const body = await parseBody(event, applicationCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  const result = await basisApplicationsRequest<{
    application: ApplicationDetail;
    clientSecret?: string;
  }>(auth, "/applications", { method: "POST", body });
  return apiResult(
    event,
    result instanceof APIError ? result : new APIResponse(result, 201, 201),
  );
});
