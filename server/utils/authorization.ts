import { DelegatedPermissionSet, type Permission } from "@basis/schema/permissions"
import type { H3Event } from "h3"
import { and, eq } from "drizzle-orm"
import { projectMembers } from "~/server/database/schema"
import { useDatabase } from "~/server/database/client"
import { authenticateRequest, type AuthenticatedRequest } from "~/server/utils/api-auth"
import { APIError } from "~/server/utils/basis-schema"
import { PortalPermissions, ProjectPermissions, type PortalCapabilities, type ProjectCapabilities, type ProjectPermission } from "~/shared/permissions"

export function portalCapabilities(grants: readonly string[]): PortalCapabilities {
  const set = new DelegatedPermissionSet(grants)
  const has = (permission: Permission) => set.has(permission)
  return {
    projectsRead: has(PortalPermissions.BiszPortal.Projects.read),
    projectsCreate: has(PortalPermissions.BiszPortal.Projects.create),
    projectsUpdate: has(PortalPermissions.BiszPortal.Projects.update),
    projectsArchive: has(PortalPermissions.BiszPortal.Projects.archive),
    projectMembersManage: has(PortalPermissions.BiszPortal.ProjectMembers.manage),
    tasksRead: has(PortalPermissions.BiszPortal.Tasks.read),
    tasksCreate: has(PortalPermissions.BiszPortal.Tasks.create),
    tasksUpdate: has(PortalPermissions.BiszPortal.Tasks.update),
    incidentsRead: has(PortalPermissions.BiszPortal.Incidents.read),
    incidentsCreate: has(PortalPermissions.BiszPortal.Incidents.create),
    incidentsUpdate: has(PortalPermissions.BiszPortal.Incidents.update),
    calendarRead: has(PortalPermissions.BiszPortal.Calendar.read),
  }
}

export async function requirePortalPermission(event: H3Event, permission: Permission) {
  const auth = await authenticateRequest(event)
  if (auth instanceof APIError) return auth
  if (!new DelegatedPermissionSet(auth.claims.permissions).has(permission)) {
    return new APIError("forbidden", "You do not have the required portal permission", 403, "forbidden")
  }
  return auth
}

export function projectCapabilities(
  auth: AuthenticatedRequest,
  membership: { role: "owner" | "member", permissions: ProjectPermission[] },
): ProjectCapabilities {
  const global = portalCapabilities(auth.claims.permissions)
  const local = (permission: ProjectPermission) => membership.role === "owner" || membership.permissions.includes(permission)
  return {
    read: global.projectsRead && local(ProjectPermissions.projectRead),
    update: global.projectsUpdate && local(ProjectPermissions.projectUpdate),
    archive: global.projectsArchive && local(ProjectPermissions.projectArchive),
    manageMembers: global.projectMembersManage && local(ProjectPermissions.membersManage),
    readTasks: global.tasksRead && local(ProjectPermissions.tasksRead),
    writeTasks: global.tasksCreate && global.tasksUpdate && local(ProjectPermissions.tasksWrite),
    readIncidents: global.incidentsRead && local(ProjectPermissions.incidentsRead),
    writeIncidents: global.incidentsCreate && global.incidentsUpdate && local(ProjectPermissions.incidentsWrite),
  }
}

export async function findMembership(projectId: string, userId: string) {
  const [membership] = await useDatabase().select().from(projectMembers).where(and(
    eq(projectMembers.projectId, projectId),
    eq(projectMembers.userId, userId),
  )).limit(1)
  return membership
}

export async function requireProjectCapability(
  auth: AuthenticatedRequest,
  projectId: string,
  capability: keyof ProjectCapabilities,
) {
  const membership = await findMembership(projectId, auth.user.id)
  if (!membership) return new APIError("not_found", "Project not found", 404, "not_found")
  const capabilities = projectCapabilities(auth, membership)
  if (!capabilities.read) return new APIError("not_found", "Project not found", 404, "not_found")
  if (!capabilities[capability]) {
    return new APIError("forbidden", "You do not have access to this project action", 403, "forbidden")
  }
  return { membership, capabilities }
}
