import { eq } from "drizzle-orm"
import { apiResult } from "~/server/utils/api-response"
import { requirePortalPermission, requireProjectCapability } from "~/server/utils/authorization"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { PortalPermissions } from "~/shared/permissions"
import { useDatabase } from "~/server/database/client"
import { projects } from "~/server/database/schema"
import { getProjectDetail } from "~/server/services/projects"

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.Projects.archive)
  if (auth instanceof APIError) return apiResult(event, auth)
  const projectId = getRouterParam(event, "projectId") ?? ""
  const access = await requireProjectCapability(auth, projectId, "archive")
  if (access instanceof APIError) return apiResult(event, access)
  await useDatabase().update(projects).set({ status: "archived", updatedAt: new Date() }).where(eq(projects.id, projectId))
  return apiResult(event, new APIResponse({ project: await getProjectDetail(auth, projectId) }))
})
