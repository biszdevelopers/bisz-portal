import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import {
  incidents,
  projects,
  taskMembers,
  tasks,
} from "~/server/database/schema";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { projectCapabilities } from "~/server/utils/authorization";
import { projectMembers } from "~/server/database/schema";
import { addDays, localDateOnly } from "~/server/utils/text-search";
import { listActivity } from "~/server/services/activity";
import { calendarEvents } from "~/server/services/calendar";
import { notificationSummary } from "~/server/services/notifications";
import { taskViewsFromRows } from "~/server/services/tasks";
import type { OverviewResponse } from "~/shared/contracts";

export async function overviewData(
  auth: AuthenticatedRequest,
): Promise<OverviewResponse> {
  const db = useDatabase();
  const memberships = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, auth.user.id));
  const capabilities = new Map(
    memberships.map((membership) => [
      membership.projectId,
      projectCapabilities(auth, membership),
    ]),
  );
  const taskProjectIds = memberships
    .filter(
      (membership) => capabilities.get(membership.projectId)?.readTasks,
    )
    .map((membership) => membership.projectId);
  const incidentProjectIds = memberships
    .filter(
      (membership) => capabilities.get(membership.projectId)?.readIncidents,
    )
    .map((membership) => membership.projectId);
  const activityProjectIds = memberships
    .filter((membership) => capabilities.get(membership.projectId)?.read)
    .map((membership) => membership.projectId);
  const today = localDateOnly();
  const weekEnd = addDays(today, 7);

  const [
    openTasks,
    dueThisWeek,
    awaitingReview,
    openIncidents,
    myTaskRows,
    upcoming,
    activityPage,
    unread,
  ] = await Promise.all([
    taskProjectIds.length
      ? db
          .select({ value: count() })
          .from(tasks)
          .where(
            and(
              inArray(tasks.projectId, taskProjectIds),
              ne(tasks.status, "done"),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
    taskProjectIds.length
      ? db
          .select({ value: count() })
          .from(tasks)
          .where(
            and(
              inArray(tasks.projectId, taskProjectIds),
              ne(tasks.status, "done"),
              sql`${tasks.dueDate} between ${today} and ${weekEnd}`,
            ),
          )
      : Promise.resolve([{ value: 0 }]),
    taskProjectIds.length
      ? db
          .select({ value: count() })
          .from(tasks)
          .where(
            and(
              inArray(tasks.projectId, taskProjectIds),
              eq(tasks.status, "in_review"),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
    incidentProjectIds.length
      ? db
          .select({ value: count() })
          .from(incidents)
          .where(
            and(
              inArray(incidents.projectId, incidentProjectIds),
              ne(incidents.status, "resolved"),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
    taskProjectIds.length
      ? db
          .select({ task: tasks, projectName: projects.name })
          .from(taskMembers)
          .innerJoin(tasks, eq(taskMembers.taskId, tasks.id))
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(
            and(
              eq(taskMembers.userId, auth.user.id),
              ne(tasks.status, "done"),
              inArray(tasks.projectId, taskProjectIds),
            ),
          )
          .orderBy(sql`${tasks.dueDate} nulls last`, asc(tasks.createdAt))
          .limit(5)
      : Promise.resolve([]),
    calendarEvents(auth, { from: today, to: weekEnd }),
    listActivity({ projectIds: activityProjectIds, limit: 8 }),
    notificationSummary(auth.user.id),
  ]);

  return {
    kpis: {
      openTasks: Number(openTasks[0]?.value ?? 0),
      dueThisWeek: Number(dueThisWeek[0]?.value ?? 0),
      awaitingReview: Number(awaitingReview[0]?.value ?? 0),
      openIncidents: Number(openIncidents[0]?.value ?? 0),
    },
    myTasks: await taskViewsFromRows(myTaskRows),
    upcoming: upcoming.slice(0, 8),
    activity: activityPage.activity,
    unread: unread.unread,
  };
}
