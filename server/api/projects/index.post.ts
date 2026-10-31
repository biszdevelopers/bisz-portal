import { DelegatedPermissionSet } from "@basis/schema/permissions";
import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import {
  assetsAccessToken,
  validateAssetsToken,
} from "~/server/utils/assets-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import {
  PortalPermissions,
  projectCreationAssetPermissionValues,
  projectPermissionValues,
} from "~/shared/permissions";
import { projectCreateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { useDatabase } from "~/server/database/client";
import { projectMembers, projects } from "~/server/database/schema";
import { getProjectDetail, slugify } from "~/server/services/projects";
import {
  AssetsProjectRequestError,
  assetsVfsProjectInput,
  cleanupAssetsProject,
  createAssetsProject,
  createAssetsProjectFilesystem,
  type AssetsProject,
} from "~/server/utils/assets-projects";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Projects.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const body = await parseBody(event, projectCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  const slug = body.slug || slugify(body.name);
  if (!slug)
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        "A valid project slug is required",
        400,
        "invalid_request",
      ),
    );

  const [existing] = await useDatabase()
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (existing) {
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
  if (
    !projectCreationAssetPermissionValues.every((permission) =>
      permissions.has(permission),
    )
  ) {
    return apiResult(
      event,
      new APIError(
        "forbidden",
        "Assets.Projects.create and Assets.Assets.create are required to create a project",
        403,
        "forbidden",
      ),
    );
  }

  const projectId = crypto.randomUUID();
  let assetsProject: AssetsProject;
  try {
    assetsProject = await createAssetsProject(assetToken, {
      name: body.name,
      description: body.description,
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

  let assetsVfsProject: AssetsProject;
  try {
    assetsVfsProject = await createAssetsProject(
      assetToken,
      assetsVfsProjectInput({ id: projectId, name: body.name }),
    );
  } catch (error) {
    await cleanupAssetsProject(
      assetToken,
      assetsProject.uid,
      "machine VFS Assets project allocation failed",
    );
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

  async function cleanupAllocatedAssetsProjects(reason: string) {
    await Promise.all([
      cleanupAssetsProject(assetsAccessTokenValue, assetsProject.uid, reason),
      cleanupAssetsProject(assetsAccessTokenValue, assetsVfsProject.uid, reason),
    ]);
  }

  let manifestObjectId: string;
  try {
    manifestObjectId = await createAssetsProjectFilesystem(
      assetToken,
      assetsVfsProject.uid,
      {
        id: projectId,
        name: body.name,
        slug,
        description: body.description,
      },
    );
  } catch (error) {
    await cleanupAllocatedAssetsProjects("Assets VFS root directory allocation failed");
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

  let project: typeof projects.$inferSelect;
  try {
    project = await useDatabase().transaction(async (transaction) => {
      const [created] = await transaction
        .insert(projects)
        .values({
          id: projectId,
          name: body.name,
          slug,
          description: body.description,
          creatorId: auth.user.id,
          assetsProjectUid: assetsProject.uid,
          assetsVfsProjectUid: assetsVfsProject.uid,
          assetsManifestObjectId: manifestObjectId,
        })
        .returning();
      if (!created) throw new Error("Project creation failed");
      await transaction.insert(projectMembers).values({
        projectId: created.id,
        userId: auth.user.id,
        role: "owner",
        permissions: [...projectPermissionValues],
      });
      return created;
    });
  } catch (error) {
    await cleanupAllocatedAssetsProjects("portal project persistence failed");
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

  return apiResult(
    event,
    new APIResponse(
      { project: await getProjectDetail(auth, project.id) },
      201,
    ),
  );
});
