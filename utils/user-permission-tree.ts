import type { UserApplicationPermissions } from "~/shared/contracts";

export type UserPermissionTreeRow = {
  id: string;
  label: string;
  kind: "application" | "namespace" | "permission";
  applicationId: string;
  prefix?: string;
  permission?: string;
  description?: string;
  rootPrefixes?: string[];
  children?: UserPermissionTreeRow[];
};

const keyOf = (value: string) => value.toLocaleLowerCase("en-US");

export function buildUserPermissionTree(
  applications: readonly UserApplicationPermissions[],
): UserPermissionTreeRow[] {
  return applications.map((application) => {
    type MutableNode = { row: UserPermissionTreeRow; children: Map<string, MutableNode> };
    const roots = new Map<string, MutableNode>();
    for (const definition of application.permissions) {
      const parts = definition.permission.split(".");
      let currentChildren = roots;
      let lastNamespace: MutableNode | undefined;
      let prefix: string[] = [];
      for (const segment of parts.slice(0, -1)) {
        prefix.push(segment);
        const fullPrefix = prefix.join(".");
        let node = currentChildren.get(keyOf(segment));
        if (!node) {
          node = {
            row: {
              id: `${application.applicationId}:namespace:${keyOf(fullPrefix)}`,
              label: segment,
              kind: "namespace",
              applicationId: application.applicationId,
              prefix: fullPrefix,
            },
            children: new Map(),
          };
          currentChildren.set(keyOf(segment), node);
        }
        lastNamespace = node;
        currentChildren = node.children;
      }
      const leaf = parts.at(-1)!;
      // `.all` is already a wildcard in the delegated permission model. Show
      // it through the namespace control instead of offering a duplicate leaf
      // checkbox with the same clause value.
      if (keyOf(leaf) === "all" && lastNamespace) continue;
      const permissionRow: UserPermissionTreeRow = {
        id: `${application.applicationId}:permission:${keyOf(definition.permission)}`,
        label: leaf,
        kind: "permission",
        applicationId: application.applicationId,
        permission: definition.permission,
        description: definition.description,
      };
      currentChildren.set(keyOf(leaf), { row: permissionRow, children: new Map() });
    }
    const descendants = (nodes: Map<string, MutableNode>): UserPermissionTreeRow[] =>
      [...nodes.values()].map(({ row, children }) => ({
        ...row,
        ...(children.size ? { children: descendants(children) } : {}),
      }));
    const children = descendants(roots);
    return {
      id: `${application.applicationId}:application`,
      label: application.name,
      kind: "application",
      applicationId: application.applicationId,
      rootPrefixes: children.filter((row) => row.kind === "namespace").map((row) => row.prefix!),
      children,
    };
  });
}

export function hasWildcard(grants: readonly string[], prefix: string): boolean {
  return grants.some((grant) => keyOf(grant) === keyOf(`${prefix}.all`));
}

export function isCoveredByWildcard(grants: readonly string[], permissionOrPrefix: string): boolean {
  const target = keyOf(permissionOrPrefix);
  return grants.some((grant) => {
    const clause = keyOf(grant);
    if (!clause.endsWith(".all")) return false;
    const prefix = clause.slice(0, -4);
    return target.startsWith(`${prefix}.`);
  });
}

export function isExplicitlyGranted(row: UserPermissionTreeRow, grants: readonly string[]): boolean {
  if (row.kind === "application") {
    return Boolean(row.rootPrefixes?.length) && row.rootPrefixes!.every((prefix) => hasWildcard(grants, prefix));
  }
  if (row.kind === "namespace") return hasWildcard(grants, row.prefix!);
  return grants.some((grant) => keyOf(grant) === keyOf(row.permission!));
}

export function isEffectivelyGranted(row: UserPermissionTreeRow, grants: readonly string[]): boolean {
  if (isExplicitlyGranted(row, grants)) return true;
  if (row.kind === "application") return false;
  return isCoveredByWildcard(grants, row.kind === "permission" ? row.permission! : row.prefix!);
}

export function isInheritedAndLocked(row: UserPermissionTreeRow, grants: readonly string[]): boolean {
  if (row.kind === "application" || row.kind === "namespace" && hasWildcard(grants, row.prefix!)) return false;
  if (row.kind === "permission") {
    return isCoveredByWildcard(grants, row.permission!);
  }
  return isCoveredByWildcard(grants, row.prefix!);
}

export function togglePermissionRow(
  row: UserPermissionTreeRow,
  grants: readonly string[],
): string[] {
  if (row.kind === "application") {
    const roots = row.rootPrefixes ?? [];
    if (!roots.length) return [...grants];
    if (roots.every((prefix) => hasWildcard(grants, prefix))) {
      return grants.filter((grant) => !roots.some((prefix) => {
        const value = keyOf(grant);
        const root = keyOf(prefix);
        return value === `${root}.all` || value.startsWith(`${root}.`);
      }));
    }
    const next = grants.filter((grant) => !roots.some((prefix) => {
      const value = keyOf(grant);
      return value === `${keyOf(prefix)}.all` || value.startsWith(`${keyOf(prefix)}.`);
    }));
    return [...next, ...roots.map((prefix) => `${prefix}.all`)].sort();
  }
  if (row.kind === "namespace") {
    const wildcard = `${row.prefix}.all`;
    if (hasWildcard(grants, row.prefix!)) {
      return grants.filter((grant) => keyOf(grant) !== keyOf(wildcard));
    }
    const prefix = keyOf(row.prefix!);
    const next = grants.filter((grant) => {
      const value = keyOf(grant);
      return value !== keyOf(wildcard) && !value.startsWith(`${prefix}.`);
    });
    return [...next, wildcard].sort();
  }
  const permission = row.permission!;
  return grants.some((grant) => keyOf(grant) === keyOf(permission))
    ? grants.filter((grant) => keyOf(grant) !== keyOf(permission))
    : [...grants, permission].sort();
}

export function selectedPermissionCount(
  row: UserPermissionTreeRow,
  application: UserApplicationPermissions,
  grants: readonly string[],
): { selected: number; total: number } {
  const permissions = application.permissions.filter(({ permission }) =>
    row.kind === "application" || permission.toLocaleLowerCase("en-US").startsWith(`${row.prefix?.toLocaleLowerCase("en-US")}.`),
  );
  const selected = permissions.filter(({ permission }) =>
    grants.some((grant) => {
      const value = keyOf(grant);
      return value === keyOf(permission) || value.endsWith(".all") && keyOf(permission).startsWith(`${value.slice(0, -4)}.`);
    }),
  ).length;
  return { selected, total: permissions.length };
}
