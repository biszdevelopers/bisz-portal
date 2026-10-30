import { describe, expect, test } from "bun:test";
import {
  projectCapabilities,
  portalCapabilities,
} from "../server/utils/authorization";
import {
  applicationCreateSchema,
  applicationDefaultPermissionsSchema,
  applicationRedirectUrisSchema,
  applicationResourceSchema,
  applicationSettingsSchema,
  memberCreateSchema,
  localDateOnly,
  projectCreateSchema,
  taskCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
} from "../shared/contracts";
import { PortalPermissions, ProjectPermissions } from "../shared/permissions";
import type { AuthenticatedRequest } from "../server/utils/api-auth";

function auth(permissions: string[]): AuthenticatedRequest {
  return {
    accessToken: "test",
    claims: {
      sub: "00000000-0000-4000-8000-000000000001",
      permissions,
    } as AuthenticatedRequest["claims"],
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Test user",
      image: null,
    },
  };
}

describe("portal and project authorization", () => {
  test("maps Basis permissions into client capabilities", () => {
    const capabilities = portalCapabilities([
      PortalPermissions.BiszPortal.Projects.read,
      PortalPermissions.BiszPortal.Tasks.read,
      PortalPermissions.BiszPortal.Tags.read,
      PortalPermissions.BiszPortal.Users.read,
      PortalPermissions.BiszPortal.Users.update,
    ]);
    expect(capabilities.projectsRead).toBe(true);
    expect(capabilities.tasksRead).toBe(true);
    expect(capabilities.tagsRead).toBe(true);
    expect(capabilities.tagsCreate).toBe(false);
    expect(capabilities.tagsDelete).toBe(false);
    expect(capabilities.usersRead).toBe(true);
    expect(capabilities.usersUpdate).toBe(true);
    expect(capabilities.projectsCreate).toBe(false);
  });

  test("maps granular application permissions and wildcard grants", () => {
    const scoped = portalCapabilities([
      PortalPermissions.BiszPortal.Applications.read,
      PortalPermissions.BiszPortal.ApplicationScopes.manage,
    ]);
    expect(scoped.applicationsRead).toBe(true);
    expect(scoped.applicationScopesManage).toBe(true);
    expect(scoped.applicationOwnersManage).toBe(false);
    const wildcard = portalCapabilities(["BiszPortal.all"]);
    expect(wildcard.applicationOwnersManage).toBe(true);
    expect(wildcard.applicationRedirectUrisManage).toBe(true);
    expect(wildcard.applicationsCreate).toBe(true);
    expect(wildcard.applicationsDelete).toBe(true);
    expect(wildcard.applicationCredentialsManage).toBe(true);
    expect(wildcard.tagsRead).toBe(true);
    expect(wildcard.tagsCreate).toBe(true);
    expect(wildcard.tagsDelete).toBe(true);
    expect(wildcard.usersRead).toBe(true);
    expect(wildcard.usersUpdate).toBe(true);
  });

  test("owners receive every local permission but still need the matching Basis permission", () => {
    const owner = { role: "owner" as const, permissions: [] };
    const allowed = projectCapabilities(
      auth([
        PortalPermissions.BiszPortal.Projects.read,
        PortalPermissions.BiszPortal.Projects.update,
      ]),
      owner,
    );
    expect(allowed.read).toBe(true);
    expect(allowed.update).toBe(true);
    expect(allowed.archive).toBe(false);
  });

  test("members need both permission layers", () => {
    const member = {
      role: "member" as const,
      permissions: [
        ProjectPermissions.projectRead,
        ProjectPermissions.tasksRead,
      ],
    };
    expect(
      projectCapabilities(
        auth([PortalPermissions.BiszPortal.Projects.read]),
        member,
      ).readTasks,
    ).toBe(false);
    expect(
      projectCapabilities(
        auth([PortalPermissions.BiszPortal.Tasks.read]),
        member,
      ).read,
    ).toBe(false);
    const permitted = projectCapabilities(
      auth([
        PortalPermissions.BiszPortal.Projects.read,
        PortalPermissions.BiszPortal.Tasks.read,
      ]),
      member,
    );
    expect(permitted.read).toBe(true);
    expect(permitted.readTasks).toBe(true);
    expect(permitted.manageMembers).toBe(false);
  });

  test("keeps task creation and updates independently permissioned", () => {
    const member = {
      role: "member" as const,
      permissions: [
        ProjectPermissions.projectRead,
        ProjectPermissions.tasksWrite,
      ],
    };
    const creator = projectCapabilities(
      auth([
        PortalPermissions.BiszPortal.Projects.read,
        PortalPermissions.BiszPortal.Tasks.create,
      ]),
      member,
    );
    expect(creator.createTasks).toBe(true);
    expect(creator.updateTasks).toBe(false);

    const updater = projectCapabilities(
      auth([
        PortalPermissions.BiszPortal.Projects.read,
        PortalPermissions.BiszPortal.Tasks.update,
      ]),
      member,
    );
    expect(updater.createTasks).toBe(false);
    expect(updater.updateTasks).toBe(true);

    const withoutLocalGrant = projectCapabilities(
      auth([
        PortalPermissions.BiszPortal.Projects.read,
        PortalPermissions.BiszPortal.Tasks.create,
        PortalPermissions.BiszPortal.Tasks.update,
      ]),
      { role: "member", permissions: [ProjectPermissions.projectRead] },
    );
    expect(withoutLocalGrant.createTasks).toBe(false);
    expect(withoutLocalGrant.updateTasks).toBe(false);
  });
});

describe("request validation", () => {
  test("validates unique default grant permissions", () => {
    expect(
      applicationDefaultPermissionsSchema.safeParse({
        permissions: ["BiszPortal.Users.read", "BiszPortal.Users.update"],
      }).success,
    ).toBe(true);
    expect(
      applicationDefaultPermissionsSchema.safeParse({
        permissions: ["BiszPortal.Users.read", "BiszPortal.Users.read"],
      }).success,
    ).toBe(false);
    expect(
      applicationDefaultPermissionsSchema.safeParse({ permissions: [] }).success,
    ).toBe(true);
  });

  test("validates the editable user fields", () => {
    expect(
      userUpdateSchema.safeParse({
        displayName: "User",
        disabled: false,
        applications: [],
      }).success,
    ).toBe(true);
    expect(
      userUpdateSchema.safeParse({
        displayName: "User",
        disabled: false,
        email: "changed@example.test",
        applications: [],
      }).success,
    ).toBe(false);
    expect(userUpdateSchema.safeParse({
      displayName: "User",
      disabled: false,
      applications: [
        { applicationId: "portal", catalogVersion: 1, grants: ["BiszPortal.Users.read"] },
        { applicationId: "portal", catalogVersion: 1, grants: [] },
      ],
    }).success).toBe(false);
  });

  test("validates and defaults user pagination", () => {
    expect(userListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(userListQuerySchema.parse({ page: "2", pageSize: "100" })).toEqual({
      page: 2,
      pageSize: 100,
    });
    expect(userListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(
      false,
    );
  });

  test("accepts project Markdown and rejects invalid slugs", () => {
    expect(
      projectCreateSchema.safeParse({
        name: "Project",
        description: "# README",
      }).success,
    ).toBe(true);
    expect(
      projectCreateSchema.safeParse({
        name: "Project",
        slug: "Not Valid",
        description: "",
      }).success,
    ).toBe(false);
  });

  test("validates task creation and date-only due dates", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const futureDueDate = localDateOnly(tomorrow);

    expect(
      taskCreateSchema.parse({
        title: "  Ship task flow  ",
        description: "# Details",
        dueDate: futureDueDate,
      }),
    ).toEqual({
      title: "Ship task flow",
      description: "# Details",
      dueDate: futureDueDate,
    });
    expect(
      taskCreateSchema.parse({ title: "No due date", dueDate: null }),
    ).toEqual({ title: "No due date", description: "", dueDate: null });
    expect(taskCreateSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        title: "Today is valid",
        dueDate: localDateOnly(),
      }).success,
    ).toBe(true);
    expect(
      taskCreateSchema.safeParse({
        title: "Past date",
        dueDate: localDateOnly(yesterday),
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({ title: "Task", dueDate: "2027-02-29" })
        .success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        title: "Task",
        dueDate: "2028-02-29T10:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        title: "Task",
        description: "x".repeat(50_001),
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({ title: "Task", projectId: crypto.randomUUID() })
        .success,
    ).toBe(false);
  });

  test("only accepts known project permissions and exact UUIDs", () => {
    expect(
      memberCreateSchema.safeParse({
        userId: "00000000-0000-4000-8000-000000000001",
        permissions: [ProjectPermissions.tasksRead],
      }).success,
    ).toBe(true);
    expect(
      memberCreateSchema.safeParse({ userId: "nope", permissions: ["root"] })
        .success,
    ).toBe(false);
  });

  test("validates application resources and unique absolute redirect URIs", () => {
    expect(
      applicationResourceSchema.safeParse({
        resourceId: "urn:test",
        name: "Test",
        availableScopes: ["records.read"],
      }).success,
    ).toBe(true);
    expect(
      applicationRedirectUrisSchema.safeParse({
        redirectUris: ["https://example.test/callback"],
      }).success,
    ).toBe(true);
    expect(
      applicationRedirectUrisSchema.safeParse({
        redirectUris: ["relative", "relative"],
      }).success,
    ).toBe(false);
  });

  test("validates application lifecycle settings", () => {
    const settings = {
      name: "Portal client",
      requireConsent: true,
      filterMode: null,
      filterContent: [],
      organizationIds: ["cbc6e1e2-a6bb-4002-bbdc-6da892a051a7"],
    };
    expect(applicationSettingsSchema.safeParse(settings).success).toBe(true);
    expect(
      applicationCreateSchema.safeParse({
        ...settings,
        public: false,
        redirectUris: ["https://example.test/callback"],
      }).success,
    ).toBe(true);
    expect(
      applicationCreateSchema.safeParse({
        ...settings,
        public: false,
        redirectUris: ["not-a-url"],
      }).success,
    ).toBe(false);
    expect(
      applicationSettingsSchema.safeParse({ ...settings, organizationIds: [] })
        .success,
    ).toBe(false);
  });
});
