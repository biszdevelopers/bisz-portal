import { describe, expect, test } from "bun:test"
import { projectCapabilities, portalCapabilities } from "../server/utils/authorization"
import { applicationRedirectUrisSchema, applicationResourceSchema, memberCreateSchema, projectCreateSchema } from "../shared/contracts"
import { PortalPermissions, ProjectPermissions } from "../shared/permissions"
import type { AuthenticatedRequest } from "../server/utils/api-auth"

function auth(permissions: string[]): AuthenticatedRequest {
  return { accessToken: "test", claims: { sub: "00000000-0000-4000-8000-000000000001", permissions } as AuthenticatedRequest["claims"], user: { id: "00000000-0000-4000-8000-000000000001", name: "Test user", image: null } }
}

describe("portal and project authorization", () => {
  test("maps Basis permissions into client capabilities", () => {
    const capabilities = portalCapabilities([PortalPermissions.BiszPortal.Projects.read, PortalPermissions.BiszPortal.Tasks.read])
    expect(capabilities.projectsRead).toBe(true)
    expect(capabilities.tasksRead).toBe(true)
    expect(capabilities.projectsCreate).toBe(false)
  })

  test("maps granular application permissions and wildcard grants", () => {
    const scoped = portalCapabilities([
      PortalPermissions.BiszPortal.Applications.read,
      PortalPermissions.BiszPortal.ApplicationScopes.manage,
    ])
    expect(scoped.applicationsRead).toBe(true)
    expect(scoped.applicationScopesManage).toBe(true)
    expect(scoped.applicationOwnersManage).toBe(false)
    const wildcard = portalCapabilities(["BiszPortal.all"])
    expect(wildcard.applicationOwnersManage).toBe(true)
    expect(wildcard.applicationRedirectUrisManage).toBe(true)
  })

  test("owners receive every local permission but still need the matching Basis permission", () => {
    const owner = { role: "owner" as const, permissions: [] }
    const allowed = projectCapabilities(auth([PortalPermissions.BiszPortal.Projects.read, PortalPermissions.BiszPortal.Projects.update]), owner)
    expect(allowed.read).toBe(true)
    expect(allowed.update).toBe(true)
    expect(allowed.archive).toBe(false)
  })

  test("members need both permission layers", () => {
    const member = { role: "member" as const, permissions: [ProjectPermissions.projectRead, ProjectPermissions.tasksRead] }
    expect(projectCapabilities(auth([PortalPermissions.BiszPortal.Projects.read]), member).readTasks).toBe(false)
    expect(projectCapabilities(auth([PortalPermissions.BiszPortal.Tasks.read]), member).read).toBe(false)
    const permitted = projectCapabilities(auth([PortalPermissions.BiszPortal.Projects.read, PortalPermissions.BiszPortal.Tasks.read]), member)
    expect(permitted.read).toBe(true)
    expect(permitted.readTasks).toBe(true)
    expect(permitted.manageMembers).toBe(false)
  })
})

describe("request validation", () => {
  test("accepts project Markdown and rejects invalid slugs", () => {
    expect(projectCreateSchema.safeParse({ name: "Project", description: "# README" }).success).toBe(true)
    expect(projectCreateSchema.safeParse({ name: "Project", slug: "Not Valid", description: "" }).success).toBe(false)
  })

  test("only accepts known project permissions and exact UUIDs", () => {
    expect(memberCreateSchema.safeParse({ userId: "00000000-0000-4000-8000-000000000001", permissions: [ProjectPermissions.tasksRead] }).success).toBe(true)
    expect(memberCreateSchema.safeParse({ userId: "nope", permissions: ["root"] }).success).toBe(false)
  })

  test("validates application resources and unique absolute redirect URIs", () => {
    expect(applicationResourceSchema.safeParse({ resourceId: "urn:test", name: "Test", availableScopes: ["records.read"] }).success).toBe(true)
    expect(applicationRedirectUrisSchema.safeParse({ redirectUris: ["https://example.test/callback"] }).success).toBe(true)
    expect(applicationRedirectUrisSchema.safeParse({ redirectUris: ["relative", "relative"] }).success).toBe(false)
  })
})
