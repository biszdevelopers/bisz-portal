import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { fetchGitHubRepository } from "~/server/utils/github-repository";
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
    .select({ githubRepository: projects.githubRepository })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.githubRepository) {
    return apiResult(
      event,
      new APIError(
        "repository_not_configured",
        "This project does not have a GitHub repository configured",
        404,
        "repository_not_configured",
      ),
    );
  }

  const result = await fetchGitHubRepository(project.githubRepository);
  if (result instanceof APIError) return apiResult(event, result);

  return apiResult(
    event,
    new APIResponse(result, 200, "repository_loaded"),
  );
});
