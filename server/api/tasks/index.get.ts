import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { taskListQuerySchema } from "~/shared/contracts";
import { listTasks, visibleTaskProjectIds } from "~/server/services/tasks";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const parsed = taskListQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "Invalid task filters",
        400,
        "invalid_request",
      ),
    );
  }
  if (parsed.data.projectId) {
    const access = await requireProjectCapability(
      auth,
      parsed.data.projectId,
      "readTasks",
    );
    if (access instanceof APIError) return apiResult(event, access);
  }
  const projectIds = await visibleTaskProjectIds(auth);
  const page = await listTasks(auth, { ...parsed.data, projectIds });
  return apiResult(event, new APIResponse(page));
});
