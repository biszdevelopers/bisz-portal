import { DelegatedPermissionSet } from "@basis/schema/permissions";
import { and, eq, isNull } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission, requireProjectCapability } from "~/server/utils/authorization";
import { assetsAccessToken, validateAssetsToken } from "~/server/utils/assets-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import {
  AssetsProjectRequestError,
  assetsManifestExists,
  assetsProjectExists,
  cleanupAssetsProject,
  createAssetsProject,
  createAssetsRootDirectory,
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
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.Projects.update);
  if (auth instanceof APIError) return apiResult(event, auth);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "update");
  if (access instanceof APIError) return apiResult(event, access);

  const [project] = await useDatabase().select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return apiResult(event, new APIError("not_found", "Project not found", 404, "not_found"));
  if (project.status === "archived") {
    return apiResult(event, new APIError("conflict", "Archived projects cannot repair their Assets link", 409, "conflict"));
  }

  let reuseAssetsProject = false;
  if (project.assetsProjectUid) {
    const projectExists = await assetsProjectExists(project.assetsProjectUid);
    if (projectExists === null) {
      return apiResult(event, new APIError("assets_unavailable", "The Assets link could not be verified, so it was not replaced", 502, "assets_unavailable"));
    }
    reuseAssetsProject = projectExists;
    if (projectExists && project.assetsManifestObjectId) {
      const manifestExists = await assetsManifestExists(project.assetsProjectUid, project.assetsManifestObjectId);
      if (manifestExists === true) {
        return apiResult(event, new APIError("conflict", "This project already has a healthy Assets VFS link", 409, "conflict"));
      }
      if (manifestExists === null) {
        return apiResult(event, new APIError("assets_unavailable", "The Assets VFS manifest could not be verified, so it was not replaced", 502, "assets_unavailable"));
      }
    }
  }

  const assetToken = await assetsAccessToken(event);
  if (assetToken instanceof APIError) return apiResult(event, assetToken);
  const assetClaims = await validateAssetsToken(assetToken, auth.user.id).catch(() => null);
  if (!assetClaims) {
    return apiResult(event, new APIError("assets_connection_expired", "Connect to DevConnect Assets again", 401, "assets_connection_expired"));
  }
  const requiredPermissions = reuseAssetsProject
    ? [AssetsPermissions.Assets.Assets.create]
    : projectCreationAssetPermissionValues;
  const permissions = new DelegatedPermissionSet(assetClaims.permissions);
  if (!requiredPermissions.every((permission) => permissions.has(permission))) {
    return apiResult(event, new APIError(
      "forbidden",
      reuseAssetsProject
        ? "Assets.Assets.create is required to repair the VFS root directory"
        : "Assets.Projects.create and Assets.Assets.create are required to repair the Assets VFS link",
      403,
      "forbidden",
    ));
  }

  let allocatedProject: AssetsProject | null = null;
  let assetsProjectUid = project.assetsProjectUid;
  if (!reuseAssetsProject) {
    try {
      allocatedProject = await createAssetsProject(assetToken, { name: project.name, description: project.description });
      assetsProjectUid = allocatedProject.uid;
    } catch (error) {
      if (error instanceof AssetsProjectRequestError) {
        return apiResult(event, new APIError("assets_project_creation_failed", error.message, error.status, "assets_project_creation_failed"));
      }
      throw error;
    }
  }
  if (!assetsProjectUid) throw new Error("Assets project allocation failed");

  let manifestObjectId: string;
  try {
    manifestObjectId = await createAssetsRootDirectory(assetToken, assetsProjectUid);
  } catch (error) {
    if (allocatedProject) await cleanupAssetsProject(assetToken, allocatedProject.uid, "Assets VFS root directory repair failed");
    if (error instanceof AssetsProjectRequestError) {
      return apiResult(event, new APIError("assets_vfs_creation_failed", error.message, error.status, "assets_vfs_creation_failed"));
    }
    throw error;
  }

  const previousUid = project.assetsProjectUid;
  const previousManifestId = project.assetsManifestObjectId;
  let updated: { id: string } | undefined;
  try {
    [updated] = await useDatabase()
      .update(projects)
      .set({ assetsProjectUid, assetsManifestObjectId: manifestObjectId, updatedAt: new Date() })
      .where(and(
        eq(projects.id, projectId),
        previousUid === null ? isNull(projects.assetsProjectUid) : eq(projects.assetsProjectUid, previousUid),
        previousManifestId === null ? isNull(projects.assetsManifestObjectId) : eq(projects.assetsManifestObjectId, previousManifestId),
      ))
      .returning({ id: projects.id });
  } catch (error) {
    if (allocatedProject) await cleanupAssetsProject(assetToken, allocatedProject.uid, "Assets VFS link repair persistence failed");
    throw error;
  }

  if (!updated) {
    if (allocatedProject) {
      await cleanupAssetsProject(assetToken, allocatedProject.uid, "another VFS link repair updated the portal project first");
    } else {
      console.error("Orphaned Assets VFS root manifest after concurrent repair", { assetsProjectUid, manifestObjectId });
    }
    return apiResult(event, new APIError("conflict", "The Assets VFS link changed while it was being repaired", 409, "conflict"));
  }

  return apiResult(event, new APIResponse({
    assets: { uid: assetsProjectUid, manifestObjectId, status: "linked" },
    project: await getProjectDetail(auth, projectId),
  }));
});
