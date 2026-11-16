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
import { recordActivity } from "~/server/services/activity";
import { createNotifications } from "~/server/services/notifications";
import { lockEditableTask } from "~/server/services/tasks";

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
    const result = await useDatabase().transaction(async (transaction) => {
      const task = await lockEditableTask(transaction, taskId);
      if (task instanceof APIError) return task;

      await transaction.insert(taskMembers).values({ taskId, userId: body.userId });
      const now = new Date();
      await transaction.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));
      await transaction.update(projects).set({ updatedAt: now }).where(eq(projects.id, task.projectId));
      const [project] = await transaction
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, task.projectId))
        .limit(1);
      await recordActivity(transaction, {
        projectId: task.projectId,
        actorId: auth.user.id,
        type: "task_members_added",
        taskId,
        metadata: { userId: body.userId, title: task.title },
      });
      if (body.userId !== auth.user.id) {
        await createNotifications(transaction, [
          {
            userId: body.userId,
            type: "task_assigned",
            title: `Assigned task: ${task.title}`,
            body: project?.name ?? "",
            url: `/tasks/${taskId}`,
            projectId: task.projectId,
            taskId,
            actorId: auth.user.id,
            dedupeKey: `task_assigned:${taskId}:${body.userId}`,
          },
        ]);
      }
    });
    if (result instanceof APIError) return apiResult(event, result);
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
