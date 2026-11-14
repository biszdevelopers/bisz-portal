import { and, eq, inArray } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { taskTemplateCreateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import {
  projectMembers,
  tags,
  taskTemplates,
} from "~/server/database/schema";
import { recordActivity } from "~/server/services/activity";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const projectId = getRouterParam(event, "projectId") ?? "";
  const access = await requireProjectCapability(auth, projectId, "createTasks");
  if (access instanceof APIError) return apiResult(event, access);
  const body = await parseBody(event, taskTemplateCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const db = useDatabase();
  if (body.tags.length) {
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
  if (body.memberIds.length) {
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
  const [created] = await db
    .insert(taskTemplates)
    .values({
      projectId,
      name: body.name,
      title: body.title,
      description: body.description,
      dueOffsetDays: body.dueOffsetDays,
      tags: body.tags,
      memberIds: body.memberIds,
      createdBy: auth.user.id,
    })
    .onConflictDoNothing({
      target: [taskTemplates.projectId, taskTemplates.name],
    })
    .returning();
  if (!created)
    return apiResult(
      event,
      new APIError(
        "template_exists",
        "A template with this name already exists",
        409,
        "template_exists",
      ),
    );
  await recordActivity(db, {
    projectId,
    actorId: auth.user.id,
    type: "template_created",
    metadata: { templateId: created.id, name: created.name },
  });
  return apiResult(
    event,
    new APIResponse({
      template: {
        id: created.id,
        projectId: created.projectId,
        name: created.name,
        title: created.title,
        description: created.description,
        dueOffsetDays: created.dueOffsetDays,
        tags: created.tags,
        memberIds: created.memberIds,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    }, 201),
  );
});
