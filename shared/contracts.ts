import { z } from "zod";
import {
  projectPermissionValues,
  type ProjectCapabilities,
  type ProjectPermission,
} from "~/shared/permissions";

export function localDateOnly(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().max(50_000).default(""),
    dueDate: z
      .iso.date()
      .nullable()
      .default(null)
      .refine(
        (value) => value === null || value >= localDateOnly(),
        "Due date cannot be in the past",
      ),
  })
  .strict();

export const tagColorSchema = z.enum([
  "blue",
  "green",
  "amber",
  "red",
  "gray",
  "purple",
]);

export type TagColor = z.infer<typeof tagColorSchema>;

export function normalizeTagName(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export const tagNameSchema = z
  .string()
  .transform(normalizeTagName)
  .pipe(
    z
      .string()
      .min(1, "Tag name is required")
      .max(64, "Tag name cannot exceed 64 characters")
      .refine((value) => !/\s/u.test(value), "Tag names cannot contain whitespace"),
  );

const tagNameListSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : [value]),
  z.array(tagNameSchema).min(1).max(100),
);

export const tagQuerySchema = z.union([
  z.object({ q: tagNameSchema, name: z.never().optional() }).strict(),
  z.object({ name: tagNameListSchema, q: z.never().optional() }).strict(),
]);

export const tagCreateSchema = z
  .object({ name: tagNameSchema, color: tagColorSchema })
  .strict();

export const tagDeleteSchema = z.object({ name: tagNameSchema }).strict();

export type TagView = {
  name: string;
  color: TagColor;
};

export const repositoryValidationSchema = z
  .object({
    repositoryUrl: z.string().trim().min(1).max(2_048),
  })
  .strict();

export type RepositoryValidationResult = {
  repository: {
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    private: boolean;
    archived: boolean;
    owner: {
      login: string;
      avatarUrl: string;
    };
    stars: number;
    forks: number;
    openIssues: number;
    updatedAt: string;
    pushedAt: string | null;
  };
  readme: {
    content: string;
    url: string;
    editUrl: string;
  };
  status: number;
  code: string | number;
};

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
  githubRepository: string | null;
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

export const userUpdateSchema = z.object({
  displayName: z.string().trim().max(200).nullable(),
  disabled: z.boolean(),
  applications: z.array(z.object({
    applicationId: z.string().min(1),
    catalogVersion: z.number().int().min(1),
    grants: z.array(z.string().min(1)),
  }).strict()).refine(
    (applications) => new Set(applications.map(({ applicationId }) => applicationId)).size === applications.length,
    "Application updates must be unique",
  ),
}).strict();

export type UserPermissionDefinition = {
  permission: string;
  description: string;
};

export type UserApplicationPermissions = {
  applicationId: string;
  name: string;
  catalogVersion: number;
  permissions: UserPermissionDefinition[];
  grants: string[];
};

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
  applications: UserApplicationPermissions[];
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
export const applicationDefaultPermissionsSchema = z.object({
  permissions: z
    .array(z.string().trim().min(1))
    .refine(
      (values) => new Set(values).size === values.length,
      "Default permissions must be unique",
    ),
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
  defaultPermissions: string[];
  permissionCatalogVersion: number;
  redirectUris: string[];
};
