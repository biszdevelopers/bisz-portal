import { apiResult } from "~/server/utils/api-response"
import { requirePortalPermission } from "~/server/utils/authorization"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { PortalPermissions, projectPermissionValues } from "~/shared/permissions"
import { projectCreateSchema } from "~/shared/contracts"
import { parseBody } from "~/server/utils/request"
import { useDatabase } from "~/server/database/client"
import { projectMembers, projects } from "~/server/database/schema"
import { getProjectDetail, slugify } from "~/server/services/projects"

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.Projects.create)
  if (auth instanceof APIError) return apiResult(event, auth)
  const body = await parseBody(event, projectCreateSchema)
  if (body instanceof APIError) return apiResult(event, body)
  const slug = body.slug || slugify(body.name)
  if (!slug) return apiResult(event, new APIError("invalid_request", "A valid project slug is required", 400, "invalid_request"))

  try {
    const project = await useDatabase().transaction(async (transaction) => {
      const [created] = await transaction.insert(projects).values({
        name: body.name, slug, description: body.description, creatorId: auth.user.id,
      }).returning()
      if (!created) throw new Error("Project creation failed")
      await transaction.insert(projectMembers).values({
        projectId: created.id, userId: auth.user.id, role: "owner", permissions: [...projectPermissionValues],
      })
      return created
    })
    return apiResult(event, new APIResponse({ project: await getProjectDetail(auth, project.id) }, 201))
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return apiResult(event, new APIError("conflict", "That project slug is already in use", 409, "conflict"))
    }
    throw error
  }
})
