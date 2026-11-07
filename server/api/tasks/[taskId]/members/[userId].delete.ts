import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { requireProjectCapability } from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import { projects, taskMembers, tasks } from "~/server/database/schema";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const taskId = getRouterParam(event, "taskId") ?? "";
  const userId = getRouterParam(event, "userId") ?? "";
  if (!z.string().uuid().safeParse(taskId).success || !z.string().uuid().safeParse(userId).success) {
    return apiResult(event, new APIError("not_found", "Task member not found", 404, "not_found"));
  }

  const [task] = await useDatabase().select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return apiResult(event, new APIError("not_found", "Task not found", 404, "not_found"));
  const access = await requireProjectCapability(auth, task.projectId, "updateTasks");
  if (access instanceof APIError) return apiResult(event, access);
  const deleted = await useDatabase().transaction(async (transaction) => {
    const rows = await transaction
      .delete(taskMembers)
      .where(and(eq(taskMembers.taskId, taskId), eq(taskMembers.userId, userId)))
      .returning({ userId: taskMembers.userId });
    if (rows.length) {
      const now = new Date();
      await transaction.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));
      await transaction.update(projects).set({ updatedAt: now }).where(eq(projects.id, task.projectId));
    }
    return rows;
  });
  if (!deleted.length) {
    return apiResult(event, new APIError("not_found", "Task member not found", 404, "not_found"));
  }
  return apiResult(event, new APIResponse({ deleted: true, userId }));
});
