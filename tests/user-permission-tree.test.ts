import { describe, expect, test } from "bun:test";
import type { UserApplicationPermissions } from "../shared/contracts";
import {
  buildUserPermissionTree,
  isEffectivelyGranted,
  isExplicitlyGranted,
  isInheritedAndLocked,
  selectedPermissionCount,
  togglePermissionRow,
} from "../utils/user-permission-tree";

const application: UserApplicationPermissions = {
  applicationId: "portal-client",
  name: "Bisz Portal",
  catalogVersion: 1,
  permissions: ["create", "read", "update", "delete"].map((action) => ({
    permission: `BiszPortal.Applications.${action}`,
    description: `${action} applications`,
  })),
  grants: [],
};

function rows(grants: string[] = []) {
  return buildUserPermissionTree([{ ...application, grants }]);
}

describe("user permission tree", () => {
  test("keeps selecting every exact child distinct from an explicit wildcard", () => {
    let grants: string[] = [];
    let tree = rows();
    const applicationRow = tree[0]!;
    const group = applicationRow.children![0]!.children![0]!;
    for (const leaf of group.children!) grants = togglePermissionRow(leaf, grants);

    tree = rows(grants);
    const savedGroup = tree[0]!.children![0]!.children![0]!;
    expect(grants).toEqual([
      "BiszPortal.Applications.create",
      "BiszPortal.Applications.delete",
      "BiszPortal.Applications.read",
      "BiszPortal.Applications.update",
    ]);
    expect(isExplicitlyGranted(savedGroup, grants)).toBe(false);
    expect(selectedPermissionCount(savedGroup, application, grants)).toEqual({ selected: 4, total: 4 });
  });

  test("a checked group wildcard lights and locks its current descendants", () => {
    const group = rows()[0]!.children![0]!.children![0]!;
    const grants = togglePermissionRow(group, []);
    const savedGroup = rows(grants)[0]!.children![0]!.children![0]!;
    const leaf = savedGroup.children![0]!;

    expect(grants).toEqual(["BiszPortal.Applications.all"]);
    expect(isExplicitlyGranted(savedGroup, grants)).toBe(true);
    expect(isEffectivelyGranted(leaf, grants)).toBe(true);
    expect(isInheritedAndLocked(leaf, grants)).toBe(true);
  });

  test("application control grants every top-level namespace with wildcards", () => {
    const applicationRow = rows()[0]!;
    const grants = togglePermissionRow(applicationRow, []);

    expect(grants).toEqual(["BiszPortal.all"]);
    expect(isExplicitlyGranted(rows(grants)[0]!, grants)).toBe(true);
    const rootNamespace = rows(grants)[0]!.children![0]!;
    expect(isExplicitlyGranted(rootNamespace, grants)).toBe(true);
    expect(isInheritedAndLocked(rootNamespace.children![0]!, grants)).toBe(true);
  });

  test("renders catalog .all entries through the group wildcard control", () => {
    const catalog = {
      ...application,
      permissions: [
        ...application.permissions,
        { permission: "BiszPortal.Applications.all", description: "All applications" },
      ],
    };
    const group = buildUserPermissionTree([catalog])[0]!.children![0]!.children![0]!;
    expect(group.children!.map((row) => row.label)).toEqual(["create", "read", "update", "delete"]);
  });
});
