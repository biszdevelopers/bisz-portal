import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { useDatabase } from "~/server/database/client";
import { projectMembers, projects, tasks } from "~/server/database/schema";
import { findBasisUsers, type BasisUserView } from "~/server/utils/basis-users";
import { projectCapabilities } from "~/server/utils/authorization";
import { taskTagViewsByTaskId } from "~/server/services/task-tags";
import { taskMemberViewsByTaskId } from "~/server/services/task-members";
import type {
  ProjectSummary,
  ProjectMemberView,
  TaskView,
} from "~/shared/contracts";

function iso(value: Date) {
  return value.toISOString();
}

async function resolveUsers(userIds: string[]) {
  return (await findBasisUsers(userIds)) as Map<
    string,
    BasisUserView | null
  >;
}

function memberView(
  member: typeof projectMembers.$inferSelect,
  auth: AuthenticatedRequest,
  users: Map<string, BasisUserView | null>,
): ProjectMemberView {
  const user = users.get(member.userId);
  return {
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
  };
}

async function taskStats(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, {
    total: number;
    completed: number;
    reviewTaskId: string | null;
  }>();
  const rows = await useDatabase()
    .select({
      projectId: tasks.projectId,
      value: count(),
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      reviewTaskId: sql<string | null>`max(${tasks.id}::text) filter (where ${tasks.status} = 'in_review')`,
    })
    .from(tasks)
    .where(inArray(tasks.projectId, projectIds))
    .groupBy(tasks.projectId);
  return new Map(
    rows.map((row) => [
      row.projectId,
      {
        total: Number(row.value),
        completed: Number(row.completed),
        reviewTaskId: row.reviewTaskId ?? null,
      },
    ]),
  );
}

export async function visibleProjectIds(auth: AuthenticatedRequest) {
  const rows = await useDatabase()
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, auth.user.id));
  return rows
    .filter((membership) => projectCapabilities(auth, membership).read)
    .map((membership) => membership.projectId);
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
  const [membershipRows, stats] = await Promise.all([
    db
      .select()
      .from(projectMembers)
      .where(inArray(projectMembers.projectId, ids)),
    taskStats(ids),
  ]);
  const users = await resolveUsers([
    ...new Set(membershipRows.map((member) => member.userId)),
  ]);
  const membersByProject = new Map<string, ProjectMemberView[]>();
  for (const member of membershipRows) {
    const memberList = membersByProject.get(member.projectId) ?? [];
    memberList.push(memberView(member, auth, users));
    membersByProject.set(member.projectId, memberList);
  }

  return visible.map(({ project, membership }) => ({
    ...summaryBase(project, membership, membersByProject.get(project.id) ?? [], stats.get(project.id)),
    capabilities: projectCapabilities(auth, membership),
  }));
}

function summaryBase(
  project: typeof projects.$inferSelect,
  membership: typeof projectMembers.$inferSelect,
  members: ProjectMemberView[],
  stats: { total: number; completed: number; reviewTaskId: string | null } | undefined,
): Omit<ProjectSummary, "capabilities"> {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    githubRepository: project.githubRepository,
    assetsProjectUid: project.assetsProjectUid,
    status: project.status,
    creatorId: project.creatorId,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
    memberCount: members.length,
    taskCount: stats?.total ?? 0,
    completedTaskCount: stats?.completed ?? 0,
    reviewTaskId: stats?.reviewTaskId ?? null,
    reviewLocked: Boolean(stats?.reviewTaskId),
    members,
  };
}

export async function getProjectSummary(
  auth: AuthenticatedRequest,
  projectId: string,
): Promise<ProjectSummary | null> {
  const db = useDatabase();
  const [row] = await db
    .select({ project: projects, membership: projectMembers })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, auth.user.id),
      ),
    )
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return null;
  const capabilities = projectCapabilities(auth, row.membership);
  if (!capabilities.read) return null;
  const [membershipRows, stats] = await Promise.all([
    db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId)),
    taskStats([projectId]),
  ]);
  const users = await resolveUsers([
    ...new Set(membershipRows.map((member) => member.userId)),
  ]);
  return {
    ...summaryBase(
      row.project,
      row.membership,
      membershipRows.map((member) => memberView(member, auth, users)),
      stats.get(projectId),
    ),
    capabilities,
  };
}

export async function getProjectDetail(
  auth: AuthenticatedRequest,
  projectId: string,
) {
  const summary = await getProjectSummary(auth, projectId);
  if (!summary) return null;
  const taskRows = summary.capabilities.readTasks
    ? await useDatabase()
        .select({ task: tasks, projectName: projects.name })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.projectId, projectId))
        .orderBy(desc(tasks.createdAt))
    : [];
  const tagsByTaskId = await taskTagViewsByTaskId(
    taskRows.map(({ task }) => task.id),
  );
  const taskMembersByTaskId = await taskMemberViewsByTaskId(
    taskRows.map(({ task }) => task.id),
  );
  const linkedTasks: TaskView[] = taskRows.map(({ task, projectName }) => ({
    id: task.id,
    projectId: task.projectId,
    creatorId: task.creatorId,
    projectName,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate,
    tags: tagsByTaskId.get(task.id) ?? [],
    members: taskMembersByTaskId.get(task.id) ?? [],
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
