import { eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import { projects } from "~/server/database/schema";
import { getProjectDetail } from "~/server/services/projects";
import { fetchGitHubRepository } from "~/server/utils/github-repository";
import { parseBody } from "~/server/utils/request";
import { repositoryValidationSchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Projects.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "update");
  if (access instanceof APIError) return apiResult(event, access);

  const body = await parseBody(event, repositoryValidationSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const repository = await fetchGitHubRepository(body.repositoryUrl);
  if (repository instanceof APIError) return apiResult(event, repository);

  await useDatabase()
    .update(projects)
    .set({
      githubRepository: repository.repository.url,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  return apiResult(
    event,
    new APIResponse(
      {
        project: await getProjectDetail(auth, projectId),
        ...repository,
      },
      200,
      "repository_updated",
    ),
  );
});
