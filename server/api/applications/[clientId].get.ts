import type { ApplicationDetail } from "~/shared/contracts"
import { PortalPermissions } from "~/shared/permissions"
import { apiResult } from "~/server/utils/api-response"
import { basisApplicationsRequest } from "~/server/utils/basis-applications"
import { requireApplicationRequest } from "~/server/utils/application-route"
import { APIError, APIResponse } from "~/server/utils/basis-schema"

export default defineEventHandler(async (event) => {
  const auth = await requireApplicationRequest(event, PortalPermissions.BiszPortal.Applications.read)
  if (auth instanceof APIError) return apiResult(event, auth)
  const id = encodeURIComponent(getRouterParam(event, "clientId") ?? "")
  const result = await basisApplicationsRequest<{ application: ApplicationDetail }>(auth, `/applications/${id}`)
  return apiResult(event, result instanceof APIError ? result : new APIResponse(result))
})
