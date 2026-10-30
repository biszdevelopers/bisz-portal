import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import { projects, tasks } from "~/server/database/schema";
import { parseBody } from "~/server/utils/request";
import { taskCreateSchema, type TaskView } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const projectId = getRouterParam(event, "projectId") ?? "";
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiResult(
      event,
      new APIError("not_found", "Project not found", 404, "not_found"),
    );
  }
  const access = await requireProjectCapability(auth, projectId, "createTasks");
  if (access instanceof APIError) return apiResult(event, access);

  const body = await parseBody(event, taskCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const result = await useDatabase().transaction(async (transaction) => {
    const [project] = await transaction
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .for("update");

    if (!project) {
      return new APIError("not_found", "Project not found", 404, "not_found");
    }
    if (project.status === "archived") {
      return new APIError(
        "project_archived",
        "Archived projects cannot receive new tasks",
        409,
        "project_archived",
      );
    }

    const [created] = await transaction
      .insert(tasks)
      .values({
        projectId: project.id,
        title: body.title,
        description: body.description,
        dueDate: body.dueDate,
      })
      .returning();
    if (!created) throw new Error("Task creation failed");

    await transaction
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    const task: TaskView = {
      id: created.id,
      projectId: created.projectId,
      projectName: project.name,
      title: created.title,
      description: created.description,
      status: created.status,
      dueDate: created.dueDate,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
    return task;
  });

  if (result instanceof APIError) return apiResult(event, result);
  return apiResult(event, new APIResponse({ task: result }, 201));
});
