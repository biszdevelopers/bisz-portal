import { apiResult } from "~/server/utils/api-response"
import { requirePortalPermission, requireProjectCapability } from "~/server/utils/authorization"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { PortalPermissions } from "~/shared/permissions"
import { memberCreateSchema } from "~/shared/contracts"
import { parseBody } from "~/server/utils/request"
import { findBasisUser } from "~/server/utils/basis-users"
import { useDatabase } from "~/server/database/client"
import { projectMembers, projects } from "~/server/database/schema"
import { getProjectDetail } from "~/server/services/projects"
import { eq } from "drizzle-orm"

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.ProjectMembers.manage)
  if (auth instanceof APIError) return apiResult(event, auth)
  const projectId = getRouterParam(event, "projectId") ?? ""
  const access = await requireProjectCapability(auth, projectId, "manageMembers")
  if (access instanceof APIError) return apiResult(event, access)
  const body = await parseBody(event, memberCreateSchema)
  if (body instanceof APIError) return apiResult(event, body)
  const basisUser = await findBasisUser(body.userId)
  if (!basisUser) return apiResult(event, new APIError("invalid_member", "That Basis user does not exist or is disabled", 400, "invalid_member"))
  try {
    await useDatabase().transaction(async (transaction) => {
      await transaction.insert(projectMembers).values({ projectId, userId: body.userId, permissions: body.permissions })
      await transaction.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
    })
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return apiResult(event, new APIError("conflict", "That user is already a project member", 409, "conflict"))
    }
    throw error
  }
  return apiResult(event, new APIResponse({ project: await getProjectDetail(auth, projectId) }, 201))
})
