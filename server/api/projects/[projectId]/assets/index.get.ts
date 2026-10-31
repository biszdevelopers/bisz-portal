import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import {
  assetsManifestExists,
  assetsProjectExists,
} from "~/server/utils/assets-projects";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { PortalPermissions } from "~/shared/permissions";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Projects.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "read");
  if (access instanceof APIError) return apiResult(event, access);

  const [project] = await useDatabase()
    .select({
      assetsProjectUid: projects.assetsProjectUid,
      assetsManifestObjectId: projects.assetsManifestObjectId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return apiResult(
      event,
      new APIError("not_found", "Project not found", 404, "not_found"),
    );
  }

  if (!project.assetsProjectUid || !project.assetsManifestObjectId) {
    return apiResult(
      event,
      new APIResponse({
        assets: {
          uid: project.assetsProjectUid,
          manifestObjectId: project.assetsManifestObjectId,
          status: "unlinked",
        },
      }),
    );
  }

  const [projectExists, manifestExists] = await Promise.all([
    assetsProjectExists(project.assetsProjectUid),
    assetsManifestExists(
      project.assetsProjectUid,
      project.assetsManifestObjectId,
    ),
  ]);
  return apiResult(
    event,
    new APIResponse({
      assets: {
        uid: project.assetsProjectUid,
        manifestObjectId: project.assetsManifestObjectId,
        status:
          projectExists === null || manifestExists === null
            ? "unavailable"
            : projectExists === true && manifestExists === true
            ? "linked"
            : "missing",
      },
    }),
  );
});
