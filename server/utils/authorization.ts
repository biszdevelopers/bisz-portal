import {
  DelegatedPermissionSet,
  type Permission,
} from "@basis/schema/permissions";
import type { H3Event } from "h3";
import { and, eq } from "drizzle-orm";
import {
  projectMembers,
  projects,
  taskMembers,
} from "~/server/database/schema";
import { useDatabase } from "~/server/database/client";
import {
  authenticateRequest,
  type AuthenticatedRequest,
} from "~/server/utils/api-auth";
import { APIError } from "~/server/utils/basis-schema";
import {
  PortalPermissions,
  ProjectPermissions,
  AssetsPermissions,
  type AssetsCapabilities,
  type PortalCapabilities,
  type ProjectCapabilities,
  type ProjectPermission,
} from "~/shared/permissions";

export function portalCapabilities(
  grants: readonly string[],
): PortalCapabilities {
  return capabilitiesFor(new DelegatedPermissionSet(grants));
}

function capabilitiesFor(set: DelegatedPermissionSet): PortalCapabilities {
  const has = (permission: Permission) => set.has(permission);
  const { Applications, Resources } = PortalPermissions.BiszPortal;
  return {
    projectsRead: has(PortalPermissions.BiszPortal.Projects.read),
    projectsCreate: has(PortalPermissions.BiszPortal.Projects.create),
    projectsUpdate: has(PortalPermissions.BiszPortal.Projects.update),
    projectsArchive: has(PortalPermissions.BiszPortal.Projects.archive),
    projectMembersManage: has(
      PortalPermissions.BiszPortal.ProjectMembers.manage,
    ),
    tasksRead: has(PortalPermissions.BiszPortal.Tasks.read),
    tasksCreate: has(PortalPermissions.BiszPortal.Tasks.create),
    tasksUpdate: has(PortalPermissions.BiszPortal.Tasks.update),
    tagsRead: has(PortalPermissions.BiszPortal.Tags.read),
    tagsCreate: has(PortalPermissions.BiszPortal.Tags.create),
    tagsDelete: has(PortalPermissions.BiszPortal.Tags.delete),
    incidentsRead: has(PortalPermissions.BiszPortal.Incidents.read),
    incidentsCreate: has(PortalPermissions.BiszPortal.Incidents.create),
    incidentsUpdate: has(PortalPermissions.BiszPortal.Incidents.update),
    calendarRead: has(PortalPermissions.BiszPortal.Calendar.read),
    usersRead: has(PortalPermissions.BiszPortal.Users.read),
    usersUpdate: has(PortalPermissions.BiszPortal.Users.update),
    applicationsRead: has(Applications.read.me) || has(Applications.read.others),
    applicationsReadMe: has(Applications.read.me),
    applicationsCreate: has(Applications.create),
    applicationsUpdate: has(Applications.update.me) || has(Applications.update.others),
    applicationsDelete: has(Applications.delete.me) || has(Applications.delete.others),
    resourcesRead: has(Resources.read.me) || has(Resources.read.others),
    applicationOwnersManage: has(
      PortalPermissions.BiszPortal.ApplicationOwners.manage,
    ),
    applicationResourcesManage: has(
      PortalPermissions.BiszPortal.ApplicationResources.manage,
    ),
    applicationPermissionsManage: has(
      PortalPermissions.BiszPortal.ApplicationPermissions.manage,
    ),
    applicationRedirectUrisManage: has(
      PortalPermissions.BiszPortal.ApplicationRedirectUris.manage,
    ),
    applicationCredentialsManage: has(
      PortalPermissions.BiszPortal.ApplicationCredentials.manage,
    ),
  };
}

export function assetsCapabilities(
  grants: readonly string[],
): AssetsCapabilities {
  const set = new DelegatedPermissionSet(grants);
  return {
    assetsCreate: set.has(AssetsPermissions.Assets.Assets.create),
    projectsCreate: set.has(AssetsPermissions.Assets.Projects.create),
  };
}

export async function requirePortalPermission(
  event: H3Event,
  permission: Permission | readonly Permission[],
) {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return auth;
  const permissions = new DelegatedPermissionSet(auth.claims.permissions);
  const required = typeof permission === "string" ? [permission] : permission;
  if (!required.some((value) => permissions.has(value))) {
    return new APIError(
      "forbidden",
      "You do not have the required portal permission",
      403,
      "forbidden",
    );
  }
  return auth;
}

export function projectCapabilities(
  auth: AuthenticatedRequest,
  membership: { role: "owner" | "member"; permissions: ProjectPermission[] },
): ProjectCapabilities {
  const grants = new DelegatedPermissionSet(auth.claims.permissions);
  const global = capabilitiesFor(grants);
  const local = (permission: ProjectPermission) =>
    membership.role === "owner" || membership.permissions.includes(permission);
  const read = global.projectsRead && local(ProjectPermissions.projectRead);
  const commentScope = membership.role === "owner" ? "me" : "others";
  return {
    read,
    update: global.projectsUpdate && local(ProjectPermissions.projectUpdate),
    archive: global.projectsArchive && local(ProjectPermissions.projectArchive),
    comment:
      read && grants.has(PortalPermissions.BiszPortal.Projects.comment[commentScope]),
    manageMembers:
      global.projectMembersManage && local(ProjectPermissions.membersManage),
    readTasks: global.tasksRead && local(ProjectPermissions.tasksRead),
    createTasks:
      global.tasksCreate && local(ProjectPermissions.tasksWrite),
    updateTasks:
      global.tasksUpdate && local(ProjectPermissions.tasksWrite),
    readIncidents:
      global.incidentsRead && local(ProjectPermissions.incidentsRead),
    writeIncidents:
      global.incidentsCreate &&
      global.incidentsUpdate &&
      local(ProjectPermissions.incidentsWrite),
  };
}

export async function canCommentOnTask(
  auth: AuthenticatedRequest,
  capabilities: ProjectCapabilities,
  projectStatus: "active" | "archived",
  task: { id: string; creatorId: string },
) {
  if (projectStatus !== "active" || !capabilities.read || !capabilities.readTasks)
    return false;

  const grants = new DelegatedPermissionSet(auth.claims.permissions);
  const { me, others } = PortalPermissions.BiszPortal.Tasks.comment;
  const canCommentOnOwn = grants.has(me);
  const canCommentOnOthers = grants.has(others);
  if (canCommentOnOwn === canCommentOnOthers) return canCommentOnOwn;
  if (task.creatorId === auth.user.id) return canCommentOnOwn;

  const [assignment] = await useDatabase()
    .select({ userId: taskMembers.userId })
    .from(taskMembers)
    .where(
      and(eq(taskMembers.taskId, task.id), eq(taskMembers.userId, auth.user.id)),
    )
    .limit(1);
  return assignment ? canCommentOnOwn : canCommentOnOthers;
}

export async function findMembership(projectId: string, userId: string) {
  const [membership] = await useDatabase()
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);
  return membership;
}

export async function requireProjectCapability(
  auth: AuthenticatedRequest,
  projectId: string,
  capability: keyof ProjectCapabilities,
) {
  const membership = await findMembership(projectId, auth.user.id);
  if (!membership)
    return new APIError("not_found", "Project not found", 404, "not_found");
  const capabilities = projectCapabilities(auth, membership);
  if (!capabilities.read)
    return new APIError("not_found", "Project not found", 404, "not_found");
  if (!capabilities[capability]) {
    return new APIError(
      "forbidden",
      "You do not have access to this project action",
      403,
      "forbidden",
    );
  }
  const mutationCapabilities: (keyof ProjectCapabilities)[] = [
    "update",
    "archive",
    "manageMembers",
    "createTasks",
    "updateTasks",
    "writeIncidents",
  ];
  if (mutationCapabilities.includes(capability)) {
    const [project] = await useDatabase()
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return new APIError("not_found", "Project not found", 404, "not_found");
    }
    if (project.status === "archived") {
      return new APIError(
        "project_archived",
        "Archived projects cannot be changed",
        409,
        "project_archived",
      );
    }
  }
  return { membership, capabilities };
}
