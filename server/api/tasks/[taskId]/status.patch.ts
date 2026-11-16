import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { canCommentOnTask, requireProjectCapability } from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { useDatabase } from "~/server/database/client";
import {
  projectMembers,
  projects,
  taskMembers,
  tasks,
} from "~/server/database/schema";
import { recordActivity } from "~/server/services/activity";
import { createNotifications } from "~/server/services/notifications";
import { taskTagViewsByTaskId } from "~/server/services/task-tags";
import { taskMemberViewsByTaskId } from "~/server/services/task-members";
import { parseBody } from "~/server/utils/request";
import {
  taskStatusTransitionSchema,
  type TaskActions,
  type TaskView,
} from "~/shared/contracts";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);

  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const taskId = getRouterParam(event, "taskId") ?? "";
  if (!z.string().uuid().safeParse(taskId).success) {
    return apiResult(
      event,
      new APIError("not_found", "Task not found", 404, "not_found"),
    );
  }
  const body = await parseBody(event, taskStatusTransitionSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const [existing] = await useDatabase()
    .select({
      projectId: tasks.projectId,
      creatorId: tasks.creatorId,
      status: tasks.status,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!existing) {
    return apiResult(
      event,
      new APIError("not_found", "Task not found", 404, "not_found"),
    );
  }

  const submitting = existing.status === "todo" && body.status === "in_review";
  const reviewing =
    existing.status === "in_review" &&
    (body.status === "todo" || body.status === "done");
  if (!submitting && !reviewing) {
    return apiResult(
      event,
      new APIError(
        "invalid_task_transition",
        "This task status transition is not allowed",
        409,
        "invalid_task_transition",
      ),
    );
  }

  let submissionEligible = existing.creatorId === auth.user.id;
  if (submitting && !submissionEligible) {
    const [assignment] = await useDatabase()
      .select({ userId: taskMembers.userId })
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.taskId, taskId),
          eq(taskMembers.userId, auth.user.id),
        ),
      )
      .limit(1);
    submissionEligible = Boolean(assignment);
  }
  if (submitting && !submissionEligible) {
    return apiResult(
      event,
      new APIError(
        "forbidden",
        "Only the task creator or an assigned member can submit it for review",
        403,
        "forbidden",
      ),
    );
  }

  const access = await requireProjectCapability(
    auth,
    existing.projectId,
    submitting ? "read" : "updateTasks",
    { allowReviewLocked: reviewing },
  );
  if (access instanceof APIError) return apiResult(event, access);

  const result = await useDatabase().transaction(async (transaction) => {
    const [project] = await transaction
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1)
      .for("update");
    if (!project) {
      return new APIError("not_found", "Task not found", 404, "not_found");
    }
    if (project.status === "archived") {
      return new APIError(
        "project_archived",
        "Archived project tasks cannot change status",
        409,
        "project_archived",
      );
    }

    const [task] = await transaction
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
      .for("update");
    if (!task || task.projectId !== project.id) {
      return new APIError("not_found", "Task not found", 404, "not_found");
    }

    if (submitting && task.creatorId !== auth.user.id) {
      const [assignment] = await transaction
        .select({ userId: taskMembers.userId })
        .from(taskMembers)
        .where(
          and(
            eq(taskMembers.taskId, task.id),
            eq(taskMembers.userId, auth.user.id),
          ),
        )
        .limit(1);
      if (!assignment) {
        return new APIError(
          "forbidden",
          "Only the task creator or an assigned member can submit it for review",
          403,
          "forbidden",
        );
      }
    }

    const validTransition = submitting
      ? task.status === "todo" && body.status === "in_review"
      : task.status === "in_review" &&
        (body.status === "todo" || body.status === "done");
    if (!validTransition) {
      return new APIError(
        "invalid_task_transition",
        "This task status transition is no longer available",
        409,
        "invalid_task_transition",
      );
    }

    if (body.status === "in_review") {
      const [otherReview] = await transaction
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, project.id),
            eq(tasks.status, "in_review"),
            ne(tasks.id, task.id),
          ),
        )
        .limit(1);
      if (otherReview) {
        return new APIError(
          "project_in_review",
          "Another task is already locking this project for review",
          409,
          "project_in_review",
        );
      }
    }

    const now = new Date();
    const [updated] = await transaction
      .update(tasks)
      .set({ status: body.status, updatedAt: now })
      .where(eq(tasks.id, task.id))
      .returning();
    if (!updated) throw new Error("Task status update failed");
    await transaction
      .update(projects)
      .set({ updatedAt: now })
      .where(eq(projects.id, project.id));

    await recordActivity(transaction, {
      projectId: project.id,
      actorId: auth.user.id,
      type:
        body.status === "in_review"
          ? "task_status_changed"
          : body.status === "done"
            ? "task_status_changed"
            : "task_status_changed",
      taskId: task.id,
      metadata: {
        title: updated.title,
        from: task.status,
        to: body.status,
      },
    });

    if (body.status === "in_review") {
      const reviewers = await transaction
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, project.id));
      const recipients = reviewers
        .filter(
          (member) =>
            member.userId !== auth.user.id &&
            (member.role === "owner" ||
              (member.permissions as string[]).includes("tasks.write")),
        )
        .map((member) => member.userId);
      if (recipients.length) {
        await createNotifications(
          transaction,
          recipients.map((userId) => ({
            userId,
            type: "review_requested" as const,
            title: `Review requested: ${updated.title}`,
            body: project.name,
            url: `/tasks/${task.id}`,
            projectId: project.id,
            taskId: task.id,
            actorId: auth.user.id,
            dedupeKey: `review:${task.id}:${userId}`,
          })),
        );
      }
    }

    return {
      task: updated,
      projectName: project.name,
      projectStatus: project.status,
    };
  });

  if (result instanceof APIError) return apiResult(event, result);
  const tagsByTaskId = await taskTagViewsByTaskId([result.task.id]);
  const membersByTaskId = await taskMemberViewsByTaskId([result.task.id]);
  const task: TaskView = {
    id: result.task.id,
    projectId: result.task.projectId,
    creatorId: result.task.creatorId,
    projectName: result.projectName,
    title: result.task.title,
    description: result.task.description,
    status: result.task.status,
    dueDate: result.task.dueDate,
    tags: tagsByTaskId.get(result.task.id) ?? [],
    members: membersByTaskId.get(result.task.id) ?? [],
    createdAt: result.task.createdAt.toISOString(),
    updatedAt: result.task.updatedAt.toISOString(),
  };
  const actions: TaskActions = {
    submitForReview:
      task.status === "todo" &&
      (task.creatorId === auth.user.id ||
        task.members.some((member) => member.userId === auth.user.id)),
    review: task.status === "in_review" && access.capabilities.updateTasks,
    manageMembers: task.status === "todo" && access.capabilities.updateTasks,
    edit:
      result.projectStatus === "active" &&
      task.status !== "in_review" &&
      access.capabilities.updateTasks,
    delete:
      result.projectStatus === "active" &&
      task.status !== "in_review" &&
      access.capabilities.updateTasks,
    duplicate:
      result.projectStatus === "active" && access.capabilities.createTasks,
    comment: await canCommentOnTask(auth, access.capabilities, result.projectStatus, task),
  };
  return apiResult(event, new APIResponse({ task, actions }));
});
