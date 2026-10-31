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
  assetsVfsProjectInput,
  assetsManifestExists,
  assetsProjectExists,
  cleanupAssetsProject,
  createAssetsProject,
  createAssetsProjectFilesystem,
  type AssetsProject,
} from "~/server/utils/assets-projects";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { getProjectDetail } from "~/server/services/projects";
import {
  AssetsPermissions,
  PortalPermissions,
  projectCreationAssetPermissionValues,
} from "~/shared/permissions";

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

  const [genericProjectExists, vfsProjectExists] = await Promise.all([
    project.assetsProjectUid
      ? assetsProjectExists(project.assetsProjectUid)
      : Promise.resolve(false),
    project.assetsVfsProjectUid
      ? assetsProjectExists(project.assetsVfsProjectUid)
      : Promise.resolve(false),
  ]);
  if (genericProjectExists === null || vfsProjectExists === null) {
    return apiResult(
      event,
      new APIError(
        "assets_unavailable",
        "The Assets projects could not be verified, so they were not replaced",
        502,
        "assets_unavailable",
      ),
    );
  }

  const manifestExists =
    vfsProjectExists &&
    project.assetsVfsProjectUid &&
    project.assetsManifestObjectId
      ? await assetsManifestExists(
          project.assetsVfsProjectUid,
          project.assetsManifestObjectId,
        )
      : false;
  if (manifestExists === null) {
    return apiResult(
      event,
      new APIError(
        "assets_unavailable",
        "The Assets VFS manifest could not be verified, so it was not replaced",
        502,
        "assets_unavailable",
      ),
    );
  }
  if (genericProjectExists && vfsProjectExists && manifestExists) {
    return apiResult(
      event,
      new APIError(
        "conflict",
        "This project already has healthy Assets and VFS links",
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

  const needsProjectAllocation = !genericProjectExists || !vfsProjectExists;
  const requiredPermissions = needsProjectAllocation
    ? projectCreationAssetPermissionValues
    : [AssetsPermissions.Assets.Assets.create];
  const permissions = new DelegatedPermissionSet(assetClaims.permissions);
  if (!requiredPermissions.every((permission) => permissions.has(permission))) {
    return apiResult(
      event,
      new APIError(
        "forbidden",
        needsProjectAllocation
          ? "Assets.Projects.create and Assets.Assets.create are required to repair the Assets links"
          : "Assets.Assets.create is required to repair the VFS root directory",
        403,
        "forbidden",
      ),
    );
  }

  const allocatedProjects: AssetsProject[] = [];
  async function cleanupAllocatedProjects(reason: string) {
    await Promise.all(
      allocatedProjects.map((allocated) =>
        cleanupAssetsProject(assetsAccessTokenValue, allocated.uid, reason),
      ),
    );
  }

  let assetsProjectUid = project.assetsProjectUid;
  let assetsVfsProjectUid = project.assetsVfsProjectUid;
  try {
    if (!genericProjectExists) {
      const allocated = await createAssetsProject(assetToken, {
        name: project.name,
        description: project.description,
      });
      allocatedProjects.push(allocated);
      assetsProjectUid = allocated.uid;
    }
    if (!vfsProjectExists) {
      const allocated = await createAssetsProject(
        assetToken,
        assetsVfsProjectInput(project),
      );
      allocatedProjects.push(allocated);
      assetsVfsProjectUid = allocated.uid;
    }
  } catch (error) {
    await cleanupAllocatedProjects("Assets link repair project allocation failed");
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
  if (!assetsProjectUid || !assetsVfsProjectUid) {
    throw new Error("Assets project allocation failed");
  }

  let manifestObjectId = project.assetsManifestObjectId;
  let allocatedManifest = false;
  if (!manifestExists) {
    try {
      manifestObjectId = await createAssetsProjectFilesystem(
        assetToken,
        assetsVfsProjectUid,
        {
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description,
        },
      );
      allocatedManifest = true;
    } catch (error) {
      await cleanupAllocatedProjects("Assets VFS root directory repair failed");
      if (error instanceof AssetsProjectRequestError) {
        return apiResult(
          event,
          new APIError(
            "assets_vfs_creation_failed",
            error.message,
            error.status,
            "assets_vfs_creation_failed",
          ),
        );
      }
      throw error;
    }
  }
  if (!manifestObjectId) throw new Error("Assets VFS allocation failed");

  const previousAssetsUid = project.assetsProjectUid;
  const previousVfsUid = project.assetsVfsProjectUid;
  const previousManifestId = project.assetsManifestObjectId;
  let updated: { id: string } | undefined;
  try {
    [updated] = await useDatabase()
      .update(projects)
      .set({
        assetsProjectUid,
        assetsVfsProjectUid,
        assetsManifestObjectId: manifestObjectId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, projectId),
          previousAssetsUid === null
            ? isNull(projects.assetsProjectUid)
            : eq(projects.assetsProjectUid, previousAssetsUid),
          previousVfsUid === null
            ? isNull(projects.assetsVfsProjectUid)
            : eq(projects.assetsVfsProjectUid, previousVfsUid),
          previousManifestId === null
            ? isNull(projects.assetsManifestObjectId)
            : eq(projects.assetsManifestObjectId, previousManifestId),
        ),
      )
      .returning({ id: projects.id });
  } catch (error) {
    await cleanupAllocatedProjects("Assets link repair persistence failed");
    throw error;
  }

  if (!updated) {
    await cleanupAllocatedProjects(
      "another Assets link repair updated the portal project first",
    );
    if (allocatedManifest && allocatedProjects.length === 0) {
      console.error("Orphaned Assets VFS root manifest after concurrent repair", {
        assetsVfsProjectUid,
        manifestObjectId,
      });
    }
    return apiResult(
      event,
      new APIError(
        "conflict",
        "The Assets links changed while they were being repaired",
        409,
        "conflict",
      ),
    );
  }

  return apiResult(
    event,
    new APIResponse({
      assets: {
        uid: assetsProjectUid,
        vfsUid: assetsVfsProjectUid,
        manifestObjectId,
        status: "linked",
      },
      project: await getProjectDetail(auth, projectId),
    }),
  );
});
