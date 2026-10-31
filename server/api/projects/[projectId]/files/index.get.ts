import { AssetsVFS, AssetsVFSError } from "@basis/assets-vfs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission, requireProjectCapability } from "~/server/utils/authorization";
import { assetsApiUrl } from "~/server/utils/assets-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { PortalPermissions } from "~/shared/permissions";

const querySchema = z.object({
  path: z.string().min(1).max(4_096).default("/"),
});

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, PortalPermissions.BiszPortal.Projects.read);
  if (auth instanceof APIError) return apiResult(event, auth);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "read");
  if (access instanceof APIError) return apiResult(event, access);

  const query = querySchema.safeParse(getQuery(event));
  if (!query.success || !query.data.path.startsWith("/")) {
    return apiResult(event, new APIError("invalid_request", "A valid absolute VFS path is required", 400, "invalid_request"));
  }

  const [project] = await useDatabase()
    .select({
      assetsProjectUid: projects.assetsProjectUid,
      assetsManifestObjectId: projects.assetsManifestObjectId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.assetsProjectUid || !project.assetsManifestObjectId) {
    return apiResult(event, new APIError("assets_link_required", "This project does not have an Assets VFS link", 409, "assets_link_required"));
  }

  try {
    const vfs = await AssetsVFS.mount({
      endpoint: assetsApiUrl(),
      manifestId: project.assetsManifestObjectId,
    });
    if (vfs.manifest?.header.projectId !== project.assetsProjectUid) {
      return apiResult(event, new APIError("assets_link_invalid", "The VFS manifest belongs to another Assets project", 409, "assets_link_invalid"));
    }
    const entries = await vfs.readdir(query.data.path);
    return apiResult(event, new APIResponse({ directory: { path: query.data.path, entries } }));
  } catch (error) {
    if (error instanceof AssetsVFSError && error.code === "EINVAL") {
      return apiResult(event, new APIError("invalid_request", "Invalid VFS directory path", 400, "invalid_request"));
    }
    if (error instanceof AssetsVFSError && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return apiResult(event, new APIError("not_found", "VFS directory not found", 404, "not_found"));
    }
    return apiResult(event, new APIError("assets_unavailable", "The Assets VFS directory could not be loaded", 502, "assets_unavailable"));
  }
});
