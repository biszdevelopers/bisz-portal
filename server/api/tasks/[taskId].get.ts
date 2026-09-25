import { eq } from "drizzle-orm"
import { apiResult } from "~/server/utils/api-response"
import { requirePortalPermission, requireProjectCapability } from "~/server/utils/authorization"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { PortalPermissions } from "~/shared/permissions"
import { useDatabase } from "~/server/database/client"
import { projects, tasks } from "~/server/database/schema"

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.Tasks.read)
  if (auth instanceof APIError) return apiResult(event, auth)
  const taskId = getRouterParam(event, "taskId") ?? ""
  const [row] = await useDatabase().select({ task: tasks, projectName: projects.name }).from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id)).where(eq(tasks.id, taskId)).limit(1)
  if (!row) return apiResult(event, new APIError("not_found", "Task not found", 404, "not_found"))
  const access = await requireProjectCapability(auth, row.task.projectId, "readTasks")
  if (access instanceof APIError) return apiResult(event, new APIError("not_found", "Task not found", 404, "not_found"))
  return apiResult(event, new APIResponse({ task: {
    id: row.task.id, projectId: row.task.projectId, projectName: row.projectName,
    title: row.task.title, description: row.task.description, status: row.task.status,
    dueDate: row.task.dueDate?.toISOString() ?? null,
    createdAt: row.task.createdAt.toISOString(), updatedAt: row.task.updatedAt.toISOString(),
  } }))
})
