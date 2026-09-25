import { definePermissionTree, flattenPermissions, type Permission } from "@basis/schema/permissions"

export const PortalPermissions = definePermissionTree({
  BiszPortal: {
    Projects: { read: true, create: true, update: true, archive: true },
    ProjectMembers: { manage: true },
    Tasks: { read: true, create: true, update: true },
    Incidents: { read: true, create: true, update: true },
    Calendar: { read: true },
  },
})

export const ProjectPermissions = {
  projectRead: "project.read",
  projectUpdate: "project.update",
  projectArchive: "project.archive",
  membersManage: "members.manage",
  tasksRead: "tasks.read",
  tasksWrite: "tasks.write",
  incidentsRead: "incidents.read",
  incidentsWrite: "incidents.write",
} as const

export type ProjectPermission = typeof ProjectPermissions[keyof typeof ProjectPermissions]
export const projectPermissionValues = Object.values(ProjectPermissions)
export const portalPermissionValues = flattenPermissions(PortalPermissions) as Permission[]

export type PortalCapabilities = {
  projectsRead: boolean
  projectsCreate: boolean
  projectsUpdate: boolean
  projectsArchive: boolean
  projectMembersManage: boolean
  tasksRead: boolean
  tasksCreate: boolean
  tasksUpdate: boolean
  incidentsRead: boolean
  incidentsCreate: boolean
  incidentsUpdate: boolean
  calendarRead: boolean
}

export type ProjectCapabilities = {
  read: boolean
  update: boolean
  archive: boolean
  manageMembers: boolean
  readTasks: boolean
  writeTasks: boolean
  readIncidents: boolean
  writeIncidents: boolean
}

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
}
