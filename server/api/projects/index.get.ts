import { apiResult } from "~/server/utils/api-response"
import { requirePortalPermission } from "~/server/utils/authorization"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { PortalPermissions } from "~/shared/permissions"
import { listProjectSummaries } from "~/server/services/projects"

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.Projects.read)
  if (auth instanceof APIError) return apiResult(event, auth)
  return apiResult(event, new APIResponse({ projects: await listProjectSummaries(auth) }))
})
