import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import {
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { activityListQuerySchema } from "~/shared/contracts";
import { useDatabase } from "~/server/database/client";
import { incidents, tasks } from "~/server/database/schema";
import { listActivity } from "~/server/services/activity";
import { visibleProjectIds } from "~/server/services/projects";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const parsed = activityListQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "Invalid activity filters",
        400,
        "invalid_request",
      ),
    );
  }
  let projectId = parsed.data.projectId;
  if (parsed.data.taskId) {
    const [row] = await useDatabase()
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, parsed.data.taskId))
      .limit(1);
    if (!row)
      return apiResult(
        event,
        new APIError("not_found", "Task not found", 404, "not_found"),
      );
    const access = await requireProjectCapability(auth, row.projectId, "readTasks");
    if (access instanceof APIError) return apiResult(event, access);
    projectId = row.projectId;
  }
  if (parsed.data.incidentId) {
    const [row] = await useDatabase()
      .select({ projectId: incidents.projectId })
      .from(incidents)
      .where(eq(incidents.id, parsed.data.incidentId))
      .limit(1);
    if (!row)
      return apiResult(
        event,
        new APIError("not_found", "Incident not found", 404, "not_found"),
      );
    const access = await requireProjectCapability(
      auth,
      row.projectId,
      "readIncidents",
    );
    if (access instanceof APIError) return apiResult(event, access);
    projectId = row.projectId;
  }
  if (projectId) {
    const access = await requireProjectCapability(auth, projectId, "read");
    if (access instanceof APIError) return apiResult(event, access);
  }
  const projectIds = projectId ? [projectId] : await visibleProjectIds(auth);
  const page = await listActivity({
    projectIds,
    projectId,
    taskId: parsed.data.taskId,
    incidentId: parsed.data.incidentId,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });
  return apiResult(event, new APIResponse(page));
});
