import { apiResult } from "~/server/utils/api-response"
import { requirePortalPermission, requireProjectCapability } from "~/server/utils/authorization"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { PortalPermissions } from "~/shared/permissions"
import { getProjectDetail } from "~/server/services/projects"

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.Projects.read)
  if (auth instanceof APIError) return apiResult(event, auth)
  const projectId = getRouterParam(event, "projectId") ?? ""
  const access = await requireProjectCapability(auth, projectId, "read")
  if (access instanceof APIError) return apiResult(event, access)
  const project = await getProjectDetail(auth, projectId)
  if (!project) return apiResult(event, new APIError("not_found", "Project not found", 404, "not_found"))
  return apiResult(event, new APIResponse({ project }))
})
