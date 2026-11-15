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
    Tags: { read: true, create: true, delete: true },
    Incidents: { read: true, create: true, update: true },
    Calendar: { read: true },
    Users: { read: true, update: true },
    Applications: {
      read: { me: true, others: true },
      create: true,
      update: { me: true, others: true },
      delete: { me: true, others: true },
    },
    Resources: {
      read: { me: true, others: true },
      update: { me: true, others: true },
      delete: { me: true, others: true },
    },
    ApplicationOwners: { manage: true },
    ApplicationResources: { manage: true },
    ApplicationPermissions: { manage: true },
    ApplicationRedirectUris: { manage: true },
    ApplicationCredentials: { manage: true },
  },
});

export const AssetsPermissions = definePermissionTree({
  Assets: {
    Assets: { create: true },
    Projects: { create: true },
  },
});

export const projectCreationAssetPermissionValues = [
  AssetsPermissions.Assets.Projects.create,
] as const;

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
export const defaultProjectMemberPermissions: ProjectPermission[] = [
  ProjectPermissions.projectRead,
  ProjectPermissions.tasksRead,
  ProjectPermissions.incidentsRead,
];
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
  tagsRead: boolean;
  tagsCreate: boolean;
  tagsDelete: boolean;
  incidentsRead: boolean;
  incidentsCreate: boolean;
  incidentsUpdate: boolean;
  calendarRead: boolean;
  usersRead: boolean;
  usersUpdate: boolean;
  applicationsRead: boolean;
  applicationsReadMe: boolean;
  applicationsCreate: boolean;
  applicationsUpdate: boolean;
  applicationsDelete: boolean;
  applicationOwnersManage: boolean;
  applicationResourcesManage: boolean;
  resourcesRead: boolean;
  applicationPermissionsManage: boolean;
  applicationRedirectUrisManage: boolean;
  applicationCredentialsManage: boolean;
};

export type AssetsCapabilities = {
  assetsCreate: boolean;
  projectsCreate: boolean;
};

export type ProjectCapabilities = {
  read: boolean;
  update: boolean;
  archive: boolean;
  manageMembers: boolean;
  readTasks: boolean;
  createTasks: boolean;
  updateTasks: boolean;
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
  tagsRead: false,
  tagsCreate: false,
  tagsDelete: false,
  incidentsRead: false,
  incidentsCreate: false,
  incidentsUpdate: false,
  calendarRead: false,
  usersRead: false,
  usersUpdate: false,
  applicationsRead: false,
  applicationsReadMe: false,
  applicationsCreate: false,
  applicationsUpdate: false,
  applicationsDelete: false,
  applicationOwnersManage: false,
  applicationResourcesManage: false,
  resourcesRead: false,
  applicationPermissionsManage: false,
  applicationRedirectUrisManage: false,
  applicationCredentialsManage: false,
};

export const emptyAssetsCapabilities: AssetsCapabilities = {
  assetsCreate: false,
  projectsCreate: false,
};
