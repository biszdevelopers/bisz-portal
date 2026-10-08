import type { ApplicationSummary } from "~/shared/contracts"
import { PortalPermissions } from "~/shared/permissions"
import { apiResult } from "~/server/utils/api-response"
import { basisApplicationsRequest } from "~/server/utils/basis-applications"
import { requireApplicationRequest } from "~/server/utils/application-route"
import { APIError, APIResponse } from "~/server/utils/basis-schema"

export default defineEventHandler(async (event) => {
  const auth = await requireApplicationRequest(event, PortalPermissions.BiszPortal.Applications.read)
  if (auth instanceof APIError) return apiResult(event, auth)
  const result = await basisApplicationsRequest<{ applications: ApplicationSummary[] }>(auth, "/applications")
  return apiResult(event, result instanceof APIError ? result : new APIResponse(result))
})
