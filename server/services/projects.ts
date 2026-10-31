import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { useDatabase } from "~/server/database/client";
import { projectMembers, projects, tasks } from "~/server/database/schema";
import { findBasisUser, type BasisUserView } from "~/server/utils/basis-users";
import { projectCapabilities } from "~/server/utils/authorization";
import type {
  ProjectSummary,
  ProjectMemberView,
  TaskView,
} from "~/shared/contracts";

function iso(value: Date) {
  return value.toISOString();
}

async function resolveUsers(userIds: string[]) {
  const entries = await Promise.all(
    userIds.map(async (id) => {
      try {
        return [id, await findBasisUser(id)] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  return new Map<string, BasisUserView | null>(entries);
}

export async function listProjectSummaries(
  auth: AuthenticatedRequest,
): Promise<ProjectSummary[]> {
  const db = useDatabase();
  const rows = await db
    .select({ project: projects, membership: projectMembers })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, auth.user.id));

  const visible = rows.filter(
    ({ membership }) => projectCapabilities(auth, membership).read,
  );
  if (!visible.length) return [];
  const ids = visible.map(({ project }) => project.id);
  const membershipRows = await db
    .select()
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, ids));
  const users = await resolveUsers([
    ...new Set(membershipRows.map((member) => member.userId)),
  ]);
  const taskCounts = await db
    .select({
      projectId: tasks.projectId,
      value: count(),
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(inArray(tasks.projectId, ids))
    .groupBy(tasks.projectId);
  const membersByProject = new Map<string, ProjectMemberView[]>();
  for (const member of membershipRows) {
    const memberList = membersByProject.get(member.projectId) ?? [];
    const user = users.get(member.userId);
    memberList.push({
      userId: member.userId,
      displayName:
        user?.displayName ??
        (member.userId === auth.user.id
          ? auth.user.name || "Basis user"
          : "Basis user"),
      image:
        user?.image ??
        (member.userId === auth.user.id ? auth.user.image : null),
      role: member.role,
      permissions: member.permissions,
      joinedAt: iso(member.createdAt),
    });
    membersByProject.set(member.projectId, memberList);
  }
  const taskMap = new Map(taskCounts.map((entry) => [entry.projectId, entry]));

  return visible.map(({ project, membership }) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    githubRepository: project.githubRepository,
    assetsProjectUid: project.assetsProjectUid,
    assetsManifestObjectId: project.assetsManifestObjectId,
    status: project.status,
    creatorId: project.creatorId,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
    memberCount: membersByProject.get(project.id)?.length ?? 0,
    taskCount: Number(taskMap.get(project.id)?.value ?? 0),
    completedTaskCount: Number(taskMap.get(project.id)?.completed ?? 0),
    members: membersByProject.get(project.id) ?? [],
    capabilities: projectCapabilities(auth, membership),
  }));
}

export async function getProjectDetail(
  auth: AuthenticatedRequest,
  projectId: string,
) {
  const summary = (await listProjectSummaries(auth)).find(
    (item) => item.id === projectId,
  );
  if (!summary) return null;
  const db = useDatabase();
  const taskRows = summary.capabilities.readTasks
    ? await db
        .select({ task: tasks, projectName: projects.name })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.projectId, projectId))
        .orderBy(desc(tasks.createdAt))
    : [];
  const linkedTasks: TaskView[] = taskRows.map(({ task, projectName }) => ({
    id: task.id,
    projectId: task.projectId,
    projectName,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate,
    createdAt: iso(task.createdAt),
    updatedAt: iso(task.updatedAt),
  }));
  return { ...summary, tasks: linkedTasks };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
