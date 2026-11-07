import { DelegatedPermissionSet } from "@basis/schema/permissions";
import { and, eq, isNull } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import {
  assetsAccessToken,
  validateAssetsToken,
} from "~/server/utils/assets-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import {
  AssetsProjectRequestError,
  assetsProjectExists,
  cleanupAssetsProject,
  createAssetsProject,
  type AssetsProject,
} from "~/server/utils/assets-projects";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { getProjectDetail } from "~/server/services/projects";
import { AssetsPermissions, PortalPermissions } from "~/shared/permissions";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Projects.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "update");
  if (access instanceof APIError) return apiResult(event, access);

  const [project] = await useDatabase()
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return apiResult(
      event,
      new APIError("not_found", "Project not found", 404, "not_found"),
    );
  }
  if (project.status === "archived") {
    return apiResult(
      event,
      new APIError(
        "conflict",
        "Archived projects cannot repair their Assets link",
        409,
        "conflict",
      ),
    );
  }

  const assetProjectExists = project.assetsProjectUid
    ? await assetsProjectExists(project.assetsProjectUid)
    : false;
  if (assetProjectExists === null) {
    return apiResult(
      event,
      new APIError(
        "assets_unavailable",
        "The Assets project could not be verified, so it was not replaced",
        502,
        "assets_unavailable",
      ),
    );
  }
  if (assetProjectExists) {
    return apiResult(
      event,
      new APIError(
        "conflict",
        "This project already has a healthy Assets project link",
        409,
        "conflict",
      ),
    );
  }

  const assetToken = await assetsAccessToken(event);
  if (assetToken instanceof APIError) return apiResult(event, assetToken);
  const assetsAccessTokenValue = assetToken;
  const assetClaims = await validateAssetsToken(assetToken, auth.user.id).catch(
    () => null,
  );
  if (!assetClaims) {
    return apiResult(
      event,
      new APIError(
        "assets_connection_expired",
        "Connect to DevConnect Assets again",
        401,
        "assets_connection_expired",
      ),
    );
  }

  const permissions = new DelegatedPermissionSet(assetClaims.permissions);
  if (!permissions.has(AssetsPermissions.Assets.Projects.create)) {
    return apiResult(
      event,
      new APIError(
        "forbidden",
        "Assets.Projects.create is required to repair the Assets link",
        403,
        "forbidden",
      ),
    );
  }

  let allocatedAssetsProject: AssetsProject;
  try {
    allocatedAssetsProject = await createAssetsProject(assetToken, {
      name: project.name,
      description: project.description,
    });
  } catch (error) {
    if (error instanceof AssetsProjectRequestError) {
      return apiResult(
        event,
        new APIError(
          "assets_project_creation_failed",
          error.message,
          error.status,
          "assets_project_creation_failed",
        ),
      );
    }
    throw error;
  }

  const previousAssetsUid = project.assetsProjectUid;
  let updated: { id: string } | undefined;
  try {
    [updated] = await useDatabase()
      .update(projects)
      .set({
        assetsProjectUid: allocatedAssetsProject.uid,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, projectId),
          previousAssetsUid === null
            ? isNull(projects.assetsProjectUid)
            : eq(projects.assetsProjectUid, previousAssetsUid),
        ),
      )
      .returning({ id: projects.id });
  } catch (error) {
    await cleanupAssetsProject(
      assetsAccessTokenValue,
      allocatedAssetsProject.uid,
      "Assets link repair persistence failed",
    );
    throw error;
  }

  if (!updated) {
    await cleanupAssetsProject(
      assetsAccessTokenValue,
      allocatedAssetsProject.uid,
      "another Assets link repair updated the portal project first",
    );
    return apiResult(
      event,
      new APIError(
        "conflict",
        "The Assets link changed while it was being repaired",
        409,
        "conflict",
      ),
    );
  }

  return apiResult(
    event,
    new APIResponse({
      assets: {
        uid: allocatedAssetsProject.uid,
        status: "linked",
      },
      project: await getProjectDetail(auth, projectId),
    }),
  );
});
