import { and, eq } from "drizzle-orm"
import { apiResult } from "~/server/utils/api-response"
import { requirePortalPermission, requireProjectCapability } from "~/server/utils/authorization"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { PortalPermissions } from "~/shared/permissions"
import { memberUpdateSchema } from "~/shared/contracts"
import { parseBody } from "~/server/utils/request"
import { useDatabase } from "~/server/database/client"
import { projectMembers, projects } from "~/server/database/schema"
import { getProjectDetail } from "~/server/services/projects"

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.ProjectMembers.manage)
  if (auth instanceof APIError) return apiResult(event, auth)
  const projectId = getRouterParam(event, "projectId") ?? ""
  const userId = getRouterParam(event, "userId") ?? ""
  const access = await requireProjectCapability(auth, projectId, "manageMembers")
  if (access instanceof APIError) return apiResult(event, access)
  const body = await parseBody(event, memberUpdateSchema)
  if (body instanceof APIError) return apiResult(event, body)
  const db = useDatabase()
  const [member] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1)
  if (!member) return apiResult(event, new APIError("not_found", "Member not found", 404, "not_found"))
  if (member.role === "owner") return apiResult(event, new APIError("owner_protected", "The project owner cannot be modified", 409, "owner_protected"))
  await db.transaction(async (transaction) => {
    await transaction.update(projectMembers).set({ permissions: body.permissions, updatedAt: new Date() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    await transaction.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  })
  return apiResult(event, new APIResponse({ project: await getProjectDetail(auth, projectId) }))
})
