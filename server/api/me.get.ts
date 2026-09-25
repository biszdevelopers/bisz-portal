import { apiResult } from "~/server/utils/api-response"
import { authenticateRequest } from "~/server/utils/api-auth"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { portalCapabilities } from "~/server/utils/authorization"

export default defineEventHandler(async (event) => {
  const authentication = await authenticateRequest(event)
  if (authentication instanceof APIError) return apiResult(event, authentication)

  return apiResult(event, new APIResponse({
    user: authentication.user,
    capabilities: portalCapabilities(authentication.claims.permissions),
  }))
})
