import { and, desc, eq, exists, inArray, lt, or, sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import {
  projectMembers,
  projects,
  taskMembers,
  taskTags,
  tasks,
} from "~/server/database/schema";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { projectCapabilities } from "~/server/utils/authorization";
import { decodeCursor, encodeCursor } from "~/server/utils/cursor";
import { addDays, localDateOnly, searchPattern } from "~/server/utils/text-search";
import { taskTagViewsByTaskId } from "~/server/services/task-tags";
import { taskMemberViewsByTaskId } from "~/server/services/task-members";
import type { TaskView } from "~/shared/contracts";

export async function visibleTaskProjectIds(auth: AuthenticatedRequest) {
  const rows = await useDatabase()
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, auth.user.id));
  return rows
    .filter((membership) => projectCapabilities(auth, membership).readTasks)
    .map((membership) => membership.projectId);
}

export async function taskViewsFromRows(
  rows: Array<{
    task: typeof tasks.$inferSelect;
    projectName: string;
  }>,
): Promise<TaskView[]> {
  const ids = rows.map(({ task }) => task.id);
  const [tagsByTaskId, membersByTaskId] = await Promise.all([
    taskTagViewsByTaskId(ids),
    taskMemberViewsByTaskId(ids),
  ]);
  return rows.map(({ task, projectName }) => ({
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
}

export async function listTasks(
  auth: AuthenticatedRequest,
  input: {
    projectIds: string[];
    projectId?: string;
    q?: string;
    status?: string;
    assigneeId?: string;
    tag?: string;
    due?: "overdue" | "today" | "week" | "none";
    mine?: boolean;
    cursor?: string;
    limit?: number;
  },
) {
  const limit = input.limit ?? 100;
  const cursor = decodeCursor(input.cursor);
  const today = localDateOnly();
  const weekEnd = addDays(today, 7);
  const conditions = [];
  if (input.projectId)
    conditions.push(eq(tasks.projectId, input.projectId));
  else if (input.projectIds.length)
    conditions.push(inArray(tasks.projectId, input.projectIds));
  else conditions.push(sql`false`);

  if (input.status)
    conditions.push(eq(tasks.status, input.status as "todo"));
  if (input.q) {
    const pattern = searchPattern(input.q);
    conditions.push(
      sql`(${tasks.searchVector} @@ websearch_to_tsquery('simple', ${input.q}) or ${tasks.title} ilike ${pattern})`,
    );
  }
  if (input.assigneeId) {
    conditions.push(
      exists(
        useDatabase()
          .select({ value: sql`1` })
          .from(taskMembers)
          .where(
            and(
              eq(taskMembers.taskId, tasks.id),
              eq(taskMembers.userId, input.assigneeId),
            ),
          ),
      ),
    );
  }
  if (input.tag) {
    conditions.push(
      exists(
        useDatabase()
          .select({ value: sql`1` })
          .from(taskTags)
          .where(
            and(
              eq(taskTags.taskId, tasks.id),
              eq(taskTags.tagName, input.tag),
            ),
          ),
      ),
    );
  }
  if (input.mine) {
    conditions.push(
      or(
        eq(tasks.creatorId, auth.user.id),
        exists(
          useDatabase()
            .select({ value: sql`1` })
            .from(taskMembers)
            .where(
              and(
                eq(taskMembers.taskId, tasks.id),
                eq(taskMembers.userId, auth.user.id),
              ),
            ),
        ),
      )!,
    );
  }
  if (input.due === "overdue")
    conditions.push(
      and(
        sql`${tasks.dueDate} is not null and ${tasks.dueDate} < ${today}`,
        sql`${tasks.status} <> 'done'`,
      )!,
    );
  if (input.due === "today")
    conditions.push(eq(tasks.dueDate, today));
  if (input.due === "week")
    conditions.push(
      sql`${tasks.dueDate} between ${today} and ${weekEnd}`,
    );
  if (input.due === "none") conditions.push(sql`${tasks.dueDate} is null`);
  if (cursor) {
    conditions.push(
      or(
        lt(tasks.createdAt, cursor.createdAt),
        and(
          eq(tasks.createdAt, cursor.createdAt),
          lt(tasks.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await useDatabase()
    .select({ task: tasks, projectName: projects.name })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1)?.task;
  return {
    tasks: await taskViewsFromRows(pageRows),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.createdAt, last.id)
        : null,
  };
}
