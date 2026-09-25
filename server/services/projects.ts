import { and, count, eq, inArray, sql } from "drizzle-orm"
import type { AuthenticatedRequest } from "~/server/utils/api-auth"
import { useDatabase } from "~/server/database/client"
import { projectMembers, projects, tasks } from "~/server/database/schema"
import { findBasisUser, type BasisUserView } from "~/server/utils/basis-users"
import { projectCapabilities } from "~/server/utils/authorization"
import type { ProjectSummary, ProjectMemberView, TaskView } from "~/shared/contracts"

function iso(value: Date) { return value.toISOString() }

export async function listProjectSummaries(auth: AuthenticatedRequest): Promise<ProjectSummary[]> {
  const db = useDatabase()
  const rows = await db.select({ project: projects, membership: projectMembers }).from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, auth.user.id))

  const visible = rows.filter(({ membership }) => projectCapabilities(auth, membership).read)
  if (!visible.length) return []
  const ids = visible.map(({ project }) => project.id)
  const memberCounts = await db.select({ projectId: projectMembers.projectId, value: count() }).from(projectMembers)
    .where(inArray(projectMembers.projectId, ids)).groupBy(projectMembers.projectId)
  const taskCounts = await db.select({
    projectId: tasks.projectId,
    value: count(),
    completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
  }).from(tasks).where(inArray(tasks.projectId, ids)).groupBy(tasks.projectId)
  const members = new Map(memberCounts.map((entry) => [entry.projectId, Number(entry.value)]))
  const taskMap = new Map(taskCounts.map((entry) => [entry.projectId, entry]))

  return visible.map(({ project, membership }) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: project.status,
    creatorId: project.creatorId,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
    memberCount: members.get(project.id) ?? 0,
    taskCount: Number(taskMap.get(project.id)?.value ?? 0),
    completedTaskCount: Number(taskMap.get(project.id)?.completed ?? 0),
    capabilities: projectCapabilities(auth, membership),
  }))
}

async function resolveUsers(userIds: string[]) {
  const entries = await Promise.all(userIds.map(async (id) => {
    try { return [id, await findBasisUser(id)] as const } catch { return [id, null] as const }
  }))
  return new Map<string, BasisUserView | null>(entries)
}

export async function getProjectDetail(auth: AuthenticatedRequest, projectId: string) {
  const summary = (await listProjectSummaries(auth)).find((item) => item.id === projectId)
  if (!summary) return null
  const db = useDatabase()
  const membershipRows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId))
  const users = await resolveUsers(membershipRows.map((member) => member.userId))
  const members: ProjectMemberView[] = membershipRows.map((member) => ({
    userId: member.userId,
    displayName: users.get(member.userId)?.displayName ?? (member.userId === auth.user.id ? auth.user.name || "Basis user" : "Basis user"),
    image: users.get(member.userId)?.image ?? (member.userId === auth.user.id ? auth.user.image : null),
    role: member.role,
    permissions: member.permissions,
    joinedAt: iso(member.createdAt),
  }))
  const taskRows = await db.select({ task: tasks, projectName: projects.name }).from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id)).where(eq(tasks.projectId, projectId))
  const linkedTasks: TaskView[] = taskRows.map(({ task, projectName }) => ({
    id: task.id,
    projectId: task.projectId,
    projectName,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate ? iso(task.dueDate) : null,
    createdAt: iso(task.createdAt),
    updatedAt: iso(task.updatedAt),
  }))
  return { ...summary, members, tasks: linkedTasks }
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120)
}
