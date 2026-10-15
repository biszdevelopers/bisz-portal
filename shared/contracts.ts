import { z } from "zod";
import {
  projectPermissionValues,
  type ProjectCapabilities,
  type ProjectPermission,
} from "~/shared/permissions";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120)
    .optional()
    .or(z.literal("")),
  description: z.string().max(50_000).default(""),
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  description: z.string().max(50_000),
});

export const memberCreateSchema = z.object({
  userId: z.string().uuid(),
  permissions: z
    .array(
      z.enum(
        projectPermissionValues as [ProjectPermission, ...ProjectPermission[]],
      ),
    )
    .default([]),
});

export const memberUpdateSchema = z.object({
  permissions: z.array(
    z.enum(
      projectPermissionValues as [ProjectPermission, ...ProjectPermission[]],
    ),
  ),
});

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "archived";
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
  members: ProjectMemberView[];
  capabilities: ProjectCapabilities;
};

export type ProjectMemberView = {
  userId: string;
  displayName: string;
  image: string | null;
  role: "owner" | "member";
  permissions: ProjectPermission[];
  joinedAt: string;
};

export type TaskView = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UserSummary = {
  id: string;
  displayName: string | null;
  email: string;
  image: string | null;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type UserPage = {
  users: UserSummary[];
  pagination: Pagination;
};

export type UserDetail = UserSummary & {
  provider: string;
  upstreamIssuer: string;
  upstreamSubject: string;
  emailSuffixId: string | null;
  studentId: string | null;
  schoolDistrict: string | null;
  disabled: boolean;
  tokensValidAfter: string | null;
  createdAt: string;
  updatedAt: string;
};

export const applicationRoleSchema = z.enum(["role.ADMIN", "role.GENERAL"]);
export type ApplicationRole = z.infer<typeof applicationRoleSchema>;

export const applicationOwnerCreateSchema = z.object({
  userId: z.string().uuid(),
  role: applicationRoleSchema,
});
export const applicationOwnerUpdateSchema = z.object({
  role: applicationRoleSchema,
});
export const applicationResourceSchema = z.object({
  resourceId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  availableScopes: z.array(z.string().trim().min(1)).default([]),
});
export const applicationResourceAttachSchema = z.object({
  resourceId: z.string().trim().min(1),
});
export const applicationResourceRemoveSchema = z.object({
  resourceId: z.string().trim().min(1),
  deleteDefinition: z.boolean().default(false),
});
export const applicationScopesSchema = z.object({
  resourceScopes: z.record(z.string(), z.array(z.string())),
});
export const applicationPermissionSchema = z.object({
  permission: z.string().min(1),
  description: z.string().trim().min(1),
});
export const applicationRedirectUrisSchema = z.object({
  redirectUris: z
    .array(z.url())
    .min(1)
    .refine(
      (values) => new Set(values).size === values.length,
      "Redirect URIs must be unique",
    ),
});
export const applicationSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  requireConsent: z.boolean(),
  filterMode: z.enum(["whitelist", "blacklist"]).nullable(),
  filterContent: z.array(z.string().trim().min(1)),
  organizationIds: z
    .array(z.string().uuid())
    .min(1)
    .refine(
      (values) => new Set(values).size === values.length,
      "Organization IDs must be unique",
    ),
});
export const applicationCreateSchema = applicationSettingsSchema.extend({
  public: z.boolean(),
  redirectUris: z
    .array(z.url())
    .min(1)
    .refine(
      (values) => new Set(values).size === values.length,
      "Redirect URIs must be unique",
    ),
});
export const applicationPermissionDeleteSchema =
  applicationPermissionSchema.pick({ permission: true });

export type ApplicationSummary = { clientId: string; name: string };
export type ApplicationOrganizationView = {
  organizationId: string;
  firstParty: boolean;
};
export type ApplicationOwnerView = {
  userId: string;
  displayName: string;
  image: string | null;
  disabled: boolean;
  role: ApplicationRole;
};
export type ApplicationResourceView = {
  resourceId: string;
  name: string;
  availableScopes: string[];
  grantedScopes: string[];
  claimCount: number;
};
export type AvailableApplicationResource = Omit<
  ApplicationResourceView,
  "grantedScopes" | "claimCount"
>;
export type ApplicationCapabilities = {
  update: boolean;
  delete: boolean;
  manageOwners: boolean;
  manageResources: boolean;
  manageScopes: boolean;
  managePermissions: boolean;
  manageRedirectUris: boolean;
  manageCredentials: boolean;
};
export type ApplicationDetail = ApplicationSummary & {
  authorizationEndpoint: string;
  public: boolean;
  requireConsent: boolean;
  filterMode: "whitelist" | "blacklist" | null;
  filterContent: string[];
  organizationIds: string[];
  availableOrganizations: ApplicationOrganizationView[];
  updatedAt: string;
  role: ApplicationRole;
  capabilities: ApplicationCapabilities;
  owners: ApplicationOwnerView[];
  resources: ApplicationResourceView[];
  availableResources: AvailableApplicationResource[];
  permissions: Array<{ permission: string; description: string }>;
  redirectUris: string[];
};
