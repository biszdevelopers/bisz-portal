import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  findMembership,
  projectCapabilities,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { recordActivity } from "~/server/services/activity";
import { getProjectSummary } from "~/server/services/projects";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Projects.archive,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const membership = await findMembership(projectId, auth.user.id);
  if (!membership)
    return apiResult(
      event,
      new APIError("not_found", "Project not found", 404, "not_found"),
    );
  const capabilities = projectCapabilities(auth, membership);
  if (!capabilities.archive)
    return apiResult(
      event,
      new APIError(
        "forbidden",
        "You cannot unarchive this project",
        403,
        "forbidden",
      ),
    );
  await useDatabase()
    .update(projects)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await recordActivity(useDatabase(), {
    projectId,
    actorId: auth.user.id,
    type: "project_unarchived",
  });
  return apiResult(
    event,
    new APIResponse({ project: await getProjectSummary(auth, projectId) }),
  );
});
