import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { memberCreateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { findBasisUser } from "~/server/utils/basis-users";
import { useDatabase } from "~/server/database/client";
import { projectMembers, projects } from "~/server/database/schema";
import { getProjectSummary } from "~/server/services/projects";
import { eq } from "drizzle-orm";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { recordActivity } from "~/server/services/activity";
import { createNotifications } from "~/server/services/notifications";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.ProjectMembers.manage,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(
    auth,
    projectId,
    "manageMembers",
  );
  if (access instanceof APIError) return apiResult(event, access);
  const body = await parseBody(event, memberCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  const basisUser = await findBasisUser(body.userId);
  if (!basisUser)
    return apiResult(
      event,
      new APIError(
        "invalid_member",
        "That Basis user does not exist or is disabled",
        400,
        "invalid_member",
      ),
    );
  try {
    await useDatabase().transaction(async (transaction) => {
      await transaction
        .insert(projectMembers)
        .values({
          projectId,
          userId: body.userId,
          permissions: body.permissions,
        });
      await transaction
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      const [project] = await transaction
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      await recordActivity(transaction, {
        projectId,
        actorId: auth.user.id,
        type: "member_added",
        metadata: { userId: body.userId },
      });
      if (body.userId !== auth.user.id) {
        await createNotifications(transaction, [
          {
            userId: body.userId,
            type: "membership_added",
            title: `Added to project: ${project?.name ?? "project"}`,
            url: `/projects/${projectId}`,
            projectId,
            actorId: auth.user.id,
            dedupeKey: `membership_added:${projectId}:${body.userId}`,
          },
        ]);
      }
    });
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
          "That user is already a project member",
          409,
          "conflict",
        ),
      );
    }
    throw error;
  }
  return apiResult(
    event,
    new APIResponse({ project: await getProjectSummary(auth, projectId) }, 201),
  );
});
