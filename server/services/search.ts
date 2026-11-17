import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import {
  incidents,
  projectMembers,
  projects,
  tasks,
} from "~/server/database/schema";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { portalCapabilities, projectCapabilities } from "~/server/utils/authorization";
import { searchPattern } from "~/server/utils/text-search";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError } from "~/server/utils/basis-schema";
import type { SearchResult } from "~/shared/contracts";

type BasisUserSearchPage = {
  users: Array<{
    id: string;
    displayName: string | null;
    email: string;
    hasPicture: boolean;
  }>;
};

export async function searchPortal(
  auth: AuthenticatedRequest,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const pattern = searchPattern(query);
  const db = useDatabase();
  const memberships = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, auth.user.id));
  const projectIds: string[] = [];
  const taskProjectIds: string[] = [];
  const incidentProjectIds: string[] = [];
  for (const membership of memberships) {
    const capabilities = projectCapabilities(auth, membership);
    if (capabilities.read) projectIds.push(membership.projectId);
    if (capabilities.readTasks) taskProjectIds.push(membership.projectId);
    if (capabilities.readIncidents)
      incidentProjectIds.push(membership.projectId);
  }
  const [projectRows, taskRows, incidentRows] = await Promise.all([
    projectIds.length
      ? db
          .select({ id: projects.id, name: projects.name, slug: projects.slug })
          .from(projects)
          .where(
            and(
              inArray(projects.id, projectIds),
              sql`(${projects.searchVector} @@ websearch_to_tsquery('simple', ${query}) or ${projects.name} ilike ${pattern})`,
            ),
          )
          .orderBy(desc(projects.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
    taskProjectIds.length
      ? db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            projectName: projects.name,
          })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(
            and(
              inArray(tasks.projectId, taskProjectIds),
              sql`(${tasks.searchVector} @@ websearch_to_tsquery('simple', ${query}) or ${tasks.title} ilike ${pattern})`,
            ),
          )
          .orderBy(desc(tasks.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
    incidentProjectIds.length
      ? db
          .select({
            id: incidents.id,
            title: incidents.title,
            status: incidents.status,
            projectName: projects.name,
          })
          .from(incidents)
          .innerJoin(projects, eq(incidents.projectId, projects.id))
          .where(
            and(
              inArray(incidents.projectId, incidentProjectIds),
              sql`(${incidents.searchVector} @@ websearch_to_tsquery('simple', ${query}) or ${incidents.title} ilike ${pattern})`,
            ),
          )
          .orderBy(desc(incidents.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
  ]);

  const results: SearchResult[] = [
    ...projectRows.map((project) => ({
      type: "project" as const,
      id: project.id,
      title: project.name,
      subtitle: `Project · ${project.slug}`,
      url: `/projects/${project.id}`,
    })),
    ...taskRows.map((task) => ({
      type: "task" as const,
      id: task.id,
      title: task.title,
      subtitle: `${task.projectName} · ${task.status.replaceAll("_", " ")}`,
      url: `/tasks/${task.id}`,
    })),
    ...incidentRows.map((incident) => ({
      type: "incident" as const,
      id: incident.id,
      title: incident.title,
      subtitle: `${incident.projectName} · ${incident.status}`,
      url: `/incidents/${incident.id}`,
    })),
  ];

  if (portalCapabilities(auth.claims.permissions).usersRead) {
    try {
      const users = await basisApplicationsRequest<BasisUserSearchPage>(
        auth,
        "/users?page=1&pageSize=100",
      );
      if (!(users instanceof APIError)) {
        const needle = query.toLocaleLowerCase();
        const matched = users.users
          .filter(
            (user) =>
              user.displayName?.toLocaleLowerCase().includes(needle) ||
              user.email.toLocaleLowerCase().includes(needle),
          )
          .slice(0, limit);
        results.push(
          ...matched.map((user) => ({
            type: "user" as const,
            id: user.id,
            title: user.displayName?.trim() || "Basis user",
            subtitle: user.email,
            url: `/users/${user.id}`,
          })),
        );
      }
    } catch {
      // User search is an optional part of the palette.
    }
  }

  return results;
}
