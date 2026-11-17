import { and, eq, inArray } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { taskTemplateUpdateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import {
  projectMembers,
  tags,
  taskTemplates,
} from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const templateId = getRouterParam(event, "templateId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "updateTasks");
  if (access instanceof APIError) return apiResult(event, access);
  const body = await parseBody(event, taskTemplateUpdateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const db = useDatabase();
  if (body.tags?.length) {
    const found = await db
      .select({ name: tags.name })
      .from(tags)
      .where(inArray(tags.name, body.tags));
    if (found.length !== new Set(body.tags).size)
      return apiResult(
        event,
        new APIError("invalid_tags", "One or more tags do not exist", 400, "invalid_tags"),
      );
  }
  if (body.memberIds?.length) {
    const members = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          inArray(projectMembers.userId, body.memberIds),
        ),
      );
    if (members.length !== new Set(body.memberIds).size)
      return apiResult(
        event,
        new APIError(
          "invalid_members",
          "Templates can only include project members",
          400,
          "invalid_members",
        ),
      );
  }
  const [updated] = await db
    .update(taskTemplates)
    .set({ ...body, updatedAt: new Date() })
    .where(
      and(
        eq(taskTemplates.id, templateId),
        eq(taskTemplates.projectId, projectId),
      ),
    )
    .returning();
  if (!updated)
    return apiResult(
      event,
      new APIError("not_found", "Template not found", 404, "not_found"),
    );
  return apiResult(
    event,
    new APIResponse({
      template: {
        id: updated.id,
        projectId: updated.projectId,
        name: updated.name,
        title: updated.title,
        description: updated.description,
        dueOffsetDays: updated.dueOffsetDays,
        tags: updated.tags,
        memberIds: updated.memberIds,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }),
  );
});
