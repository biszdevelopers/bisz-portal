import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import {
  incidents,
  projectMembers,
  projects,
  tasks,
} from "~/server/database/schema";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { projectCapabilities } from "~/server/utils/authorization";
import type { CalendarEvent } from "~/shared/contracts";

export async function calendarEvents(
  auth: AuthenticatedRequest,
  input: { from: string; to: string; projectId?: string },
): Promise<CalendarEvent[]> {
  const memberships = await useDatabase()
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, auth.user.id));
  const capabilitiesByProject = new Map(
    memberships.map((membership) => [
      membership.projectId,
      projectCapabilities(auth, membership),
    ]),
  );
  const taskProjectIds = memberships
    .filter((membership) => capabilitiesByProject.get(membership.projectId)?.readTasks)
    .map((membership) => membership.projectId);
  const incidentProjectIds = memberships
    .filter(
      (membership) => capabilitiesByProject.get(membership.projectId)?.readIncidents,
    )
    .map((membership) => membership.projectId);

  const taskIds = input.projectId
    ? taskProjectIds.includes(input.projectId)
      ? [input.projectId]
      : []
    : taskProjectIds;
  const incidentIds = input.projectId
    ? incidentProjectIds.includes(input.projectId)
      ? [input.projectId]
      : []
    : incidentProjectIds;

  const [taskRows, incidentRows] = await Promise.all([
    taskIds.length
      ? useDatabase()
          .select({ task: tasks, projectName: projects.name })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(
            and(
              inArray(tasks.projectId, taskIds),
              sql`${tasks.dueDate} is not null`,
              gte(tasks.dueDate, input.from),
              lte(tasks.dueDate, input.to),
            ),
          )
          .limit(500)
      : Promise.resolve([]),
    incidentIds.length
      ? useDatabase()
          .select({ incident: incidents, projectName: projects.name })
          .from(incidents)
          .innerJoin(projects, eq(incidents.projectId, projects.id))
          .where(
            and(
              inArray(incidents.projectId, incidentIds),
              sql`${incidents.dueDate} is not null`,
              gte(incidents.dueDate, input.from),
              lte(incidents.dueDate, input.to),
              ne(incidents.status, "resolved"),
            ),
          )
          .limit(500)
      : Promise.resolve([]),
  ]);

  const events: CalendarEvent[] = [
    ...taskRows.map(({ task, projectName }) => ({
      id: task.id,
      type: "task" as const,
      title: task.title,
      date: task.dueDate!,
      projectId: task.projectId,
      projectName,
      status: task.status,
      url: `/tasks/${task.id}`,
    })),
    ...incidentRows.map(({ incident, projectName }) => ({
      id: incident.id,
      type: "incident" as const,
      title: incident.title,
      date: incident.dueDate!,
      projectId: incident.projectId,
      projectName,
      status: incident.status,
      severity: incident.severity,
      url: `/incidents/${incident.id}`,
    })),
  ];
  return events.sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.title.localeCompare(right.title),
  );
}
