import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import {
  incidents,
  projectMembers,
  projects,
} from "~/server/database/schema";
import { projectCapabilities } from "~/server/utils/authorization";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { findBasisUser, findBasisUsers } from "~/server/utils/basis-users";
import { decodeCursor, encodeCursor } from "~/server/utils/cursor";
import { searchPattern } from "~/server/utils/text-search";
import type {
  IncidentPage,
  IncidentView,
  UserSummary,
} from "~/shared/contracts";

export async function visibleIncidentProjectIds(auth: AuthenticatedRequest) {
  const rows = await useDatabase()
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, auth.user.id));
  return rows
    .filter((membership) => projectCapabilities(auth, membership).readIncidents)
    .map((membership) => membership.projectId);
}

function toUserSummary(
  userId: string | null,
  users: Map<string, { displayName: string; image: string | null } | null>,
): UserSummary | null {
  if (!userId) return null;
  const user = users.get(userId);
  if (!user) return null;
  return {
    id: userId,
    displayName: user.displayName,
    email: "",
    image: user.image,
  };
}

export async function listIncidents(
  auth: AuthenticatedRequest,
  input: {
    projectIds: string[];
    projectId?: string;
    status?: string;
    severity?: string;
    assigneeId?: string;
    q?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<IncidentPage> {
  const limit = input.limit ?? 30;
  const cursor = decodeCursor(input.cursor);
  const conditions = [];
  if (input.projectId)
    conditions.push(eq(incidents.projectId, input.projectId));
  else if (input.projectIds.length)
    conditions.push(inArray(incidents.projectId, input.projectIds));
  else conditions.push(sql`false`);
  if (input.status) conditions.push(eq(incidents.status, input.status as "open"));
  if (input.severity)
    conditions.push(eq(incidents.severity, input.severity as "low"));
  if (input.assigneeId)
    conditions.push(eq(incidents.assigneeId, input.assigneeId));
  if (input.q) {
    const pattern = searchPattern(input.q);
    conditions.push(
      sql`(${incidents.searchVector} @@ websearch_to_tsquery('simple', ${input.q}) or ${incidents.title} ilike ${pattern})`,
    );
  }
  if (cursor) {
    conditions.push(
      or(
        lt(incidents.createdAt, cursor.createdAt),
        and(
          eq(incidents.createdAt, cursor.createdAt),
          lt(incidents.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await useDatabase()
    .select({ incident: incidents, projectName: projects.name })
    .from(incidents)
    .innerJoin(projects, eq(incidents.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(incidents.createdAt), desc(incidents.id))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const users = await findBasisUsers(
    pageRows
      .map(({ incident }) => incident.assigneeId)
      .filter((value): value is string => Boolean(value)),
  );
  const last = pageRows.at(-1)?.incident;
  const projectMembership = new Map(
    (
      await useDatabase()
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, auth.user.id))
    ).map((membership) => [membership.projectId, membership]),
  );

  return {
    incidents: pageRows.map(({ incident, projectName }) => {
      const membership = projectMembership.get(incident.projectId);
      return {
        id: incident.id,
        projectId: incident.projectId,
        projectName,
        creatorId: incident.creatorId,
        assigneeId: incident.assigneeId,
        assignee: toUserSummary(incident.assigneeId, users),
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        status: incident.status,
        dueDate: incident.dueDate,
        resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
        capabilities: {
          update: Boolean(
            membership && projectCapabilities(auth, membership).writeIncidents,
          ),
        },
      } satisfies IncidentView;
    }),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.createdAt, last.id)
        : null,
  };
}

export async function getIncidentView(
  auth: AuthenticatedRequest,
  incidentId: string,
): Promise<IncidentView | null> {
  const [row] = await useDatabase()
    .select({ incident: incidents, projectName: projects.name })
    .from(incidents)
    .innerJoin(projects, eq(incidents.projectId, projects.id))
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!row) return null;
  const [membership] = await useDatabase()
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, row.incident.projectId),
        eq(projectMembers.userId, auth.user.id),
      ),
    )
    .limit(1);
  if (!membership) return null;
  const capabilities = projectCapabilities(auth, membership);
  if (!capabilities.readIncidents) return null;
  const assignee = row.incident.assigneeId
    ? await findBasisUser(row.incident.assigneeId).catch(() => null)
    : null;
  return {
    id: row.incident.id,
    projectId: row.incident.projectId,
    projectName: row.projectName,
    creatorId: row.incident.creatorId,
    assigneeId: row.incident.assigneeId,
    assignee: assignee
      ? {
          id: assignee.id,
          displayName: assignee.displayName,
          email: "",
          image: assignee.image,
        }
      : null,
    title: row.incident.title,
    description: row.incident.description,
    severity: row.incident.severity,
    status: row.incident.status,
    dueDate: row.incident.dueDate,
    resolvedAt: row.incident.resolvedAt?.toISOString() ?? null,
    createdAt: row.incident.createdAt.toISOString(),
    updatedAt: row.incident.updatedAt.toISOString(),
    capabilities: { update: capabilities.writeIncidents },
  };
}
