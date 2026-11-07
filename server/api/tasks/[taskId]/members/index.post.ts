import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { requireProjectCapability } from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import { projectMembers, projects, taskMembers, tasks } from "~/server/database/schema";
import { findBasisUser } from "~/server/utils/basis-users";
import { parseBody } from "~/server/utils/request";
import { taskMemberCreateSchema } from "~/shared/contracts";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const taskId = getRouterParam(event, "taskId") ?? "";
  if (!z.string().uuid().safeParse(taskId).success) {
    return apiResult(event, new APIError("not_found", "Task not found", 404, "not_found"));
  }
  const body = await parseBody(event, taskMemberCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const [task] = await useDatabase().select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return apiResult(event, new APIError("not_found", "Task not found", 404, "not_found"));
  const access = await requireProjectCapability(auth, task.projectId, "updateTasks");
  if (access instanceof APIError) return apiResult(event, access);

  const [membership, user] = await Promise.all([
    useDatabase()
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.userId, body.userId)))
      .limit(1)
      .then((rows) => rows[0]),
    findBasisUser(body.userId),
  ]);
  if (!membership || !user) {
    return apiResult(
      event,
      new APIError("invalid_task_member", "Task members must be active project members", 400, "invalid_task_member"),
    );
  }

  try {
    await useDatabase().transaction(async (transaction) => {
      await transaction.insert(taskMembers).values({ taskId, userId: body.userId });
      const now = new Date();
      await transaction.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));
      await transaction.update(projects).set({ updatedAt: now }).where(eq(projects.id, task.projectId));
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return apiResult(event, new APIError("conflict", "That user is already a task member", 409, "conflict"));
    }
    throw error;
  }
  return apiResult(
    event,
    new APIResponse(
      { member: { userId: user.id, displayName: user.displayName, image: user.image, role: "assignee" as const } },
      201,
    ),
  );
});
