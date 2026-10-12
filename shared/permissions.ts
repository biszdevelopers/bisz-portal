import {
  definePermissionTree,
  flattenPermissions,
  type Permission,
} from "@basis/schema/permissions";

export const PortalPermissions = definePermissionTree({
  BiszPortal: {
    Projects: { read: true, create: true, update: true, archive: true },
    ProjectMembers: { manage: true },
    Tasks: { read: true, create: true, update: true },
    Incidents: { read: true, create: true, update: true },
    Calendar: { read: true },
    Applications: { read: true, create: true, update: true, delete: true },
    ApplicationOwners: { manage: true },
    ApplicationResources: { manage: true },
    ApplicationScopes: { manage: true },
    ApplicationPermissions: { manage: true },
    ApplicationRedirectUris: { manage: true },
    ApplicationCredentials: { manage: true },
  },
});

export const ProjectPermissions = {
  projectRead: "project.read",
  projectUpdate: "project.update",
  projectArchive: "project.archive",
  membersManage: "members.manage",
  tasksRead: "tasks.read",
  tasksWrite: "tasks.write",
  incidentsRead: "incidents.read",
  incidentsWrite: "incidents.write",
} as const;

export type ProjectPermission =
  (typeof ProjectPermissions)[keyof typeof ProjectPermissions];
export const projectPermissionValues = Object.values(ProjectPermissions);
export const portalPermissionValues = flattenPermissions(
  PortalPermissions,
) as Permission[];

export type PortalCapabilities = {
  projectsRead: boolean;
  projectsCreate: boolean;
  projectsUpdate: boolean;
  projectsArchive: boolean;
  projectMembersManage: boolean;
  tasksRead: boolean;
  tasksCreate: boolean;
  tasksUpdate: boolean;
  incidentsRead: boolean;
  incidentsCreate: boolean;
  incidentsUpdate: boolean;
  calendarRead: boolean;
  applicationsRead: boolean;
  applicationsCreate: boolean;
  applicationsUpdate: boolean;
  applicationsDelete: boolean;
  applicationOwnersManage: boolean;
  applicationResourcesManage: boolean;
  applicationScopesManage: boolean;
  applicationPermissionsManage: boolean;
  applicationRedirectUrisManage: boolean;
  applicationCredentialsManage: boolean;
};

export type ProjectCapabilities = {
  read: boolean;
  update: boolean;
  archive: boolean;
  manageMembers: boolean;
  readTasks: boolean;
  writeTasks: boolean;
  readIncidents: boolean;
  writeIncidents: boolean;
};

export const emptyPortalCapabilities: PortalCapabilities = {
  projectsRead: false,
  projectsCreate: false,
  projectsUpdate: false,
  projectsArchive: false,
  projectMembersManage: false,
  tasksRead: false,
  tasksCreate: false,
  tasksUpdate: false,
  incidentsRead: false,
  incidentsCreate: false,
  incidentsUpdate: false,
  calendarRead: false,
  applicationsRead: false,
  applicationsCreate: false,
  applicationsUpdate: false,
  applicationsDelete: false,
  applicationOwnersManage: false,
  applicationResourcesManage: false,
  applicationScopesManage: false,
  applicationPermissionsManage: false,
  applicationRedirectUrisManage: false,
  applicationCredentialsManage: false,
};
