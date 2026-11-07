import { and, eq, inArray } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  projectCapabilities,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { useDatabase } from "~/server/database/client";
import { projectMembers, projects, tasks } from "~/server/database/schema";
import type { TaskView } from "~/shared/contracts";
import { taskTagViewsByTaskId } from "~/server/services/task-tags";
import { taskMemberViewsByTaskId } from "~/server/services/task-members";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const query = getQuery(event);
  const projectId =
    typeof query.projectId === "string" ? query.projectId : null;
  const status = ["todo", "in_review", "done"].includes(String(query.status))
    ? (query.status as "todo" | "in_review" | "done")
    : null;
  if (projectId) {
    const access = await requireProjectCapability(auth, projectId, "readTasks");
    if (access instanceof APIError) return apiResult(event, access);
  }

  const db = useDatabase();
  const memberships = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, auth.user.id));
  const projectIds = memberships
    .filter((membership) => projectCapabilities(auth, membership).readTasks)
    .map((membership) => membership.projectId);
  if (!projectIds.length)
    return apiResult(event, new APIResponse({ tasks: [] }));
  const conditions = [
    inArray(tasks.projectId, projectId ? [projectId] : projectIds),
  ];
  if (status) conditions.push(eq(tasks.status, status));
  const rows = await db
    .select({ task: tasks, projectName: projects.name })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(...conditions));
  const tagsByTaskId = await taskTagViewsByTaskId(
    rows.map(({ task }) => task.id),
  );
  const membersByTaskId = await taskMemberViewsByTaskId(
    rows.map(({ task }) => task.id),
  );
  const result: TaskView[] = rows.map(({ task, projectName }) => ({
    id: task.id,
    projectId: task.projectId,
    creatorId: task.creatorId,
    projectName,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate,
    tags: tagsByTaskId.get(task.id) ?? [],
    members: membersByTaskId.get(task.id) ?? [],
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }));
  return apiResult(event, new APIResponse({ tasks: result }));
});
