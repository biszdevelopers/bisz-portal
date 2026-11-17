import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { projectUpdateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { getProjectSummary } from "~/server/services/projects";
import { recordActivity } from "~/server/services/activity";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Projects.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "update");
  if (access instanceof APIError) return apiResult(event, access);
  const body = await parseBody(event, projectUpdateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  try {
    await useDatabase()
      .update(projects)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await recordActivity(useDatabase(), {
      projectId,
      actorId: auth.user.id,
      type: "project_updated",
      metadata: { title: body.name },
    });
    return apiResult(
      event,
      new APIResponse({ project: await getProjectSummary(auth, projectId) }),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "23505"
    ) {
      return apiResult(
        event,
        new APIError(
          "conflict",
          "That project slug is already in use",
          409,
          "conflict",
        ),
      );
    }
    throw error;
  }
});
