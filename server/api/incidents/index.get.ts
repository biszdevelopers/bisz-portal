import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { incidentListQuerySchema } from "~/shared/contracts";
import {
  listIncidents,
  visibleIncidentProjectIds,
} from "~/server/services/incidents";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Incidents.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const parsed = incidentListQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "Invalid incident filters",
        400,
        "invalid_request",
      ),
    );
  }
  if (parsed.data.projectId) {
    const access = await requireProjectCapability(
      auth,
      parsed.data.projectId,
      "readIncidents",
    );
    if (access instanceof APIError) return apiResult(event, access);
  }
  const projectIds = await visibleIncidentProjectIds(auth);
  const page = await listIncidents(auth, { ...parsed.data, projectIds });
  return apiResult(event, new APIResponse(page));
});
