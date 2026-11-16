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
  memberIds: z
    .array(z.string().uuid())
    .max(50)
    .default([])
    .refine((values) => new Set(values).size === values.length, "Project members must be unique"),
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
    tags: z
      .array(tagNameSchema)
      .max(20, "A task can have at most 20 tags")
      .default([])
      .refine(
        (values) => new Set(values).size === values.length,
        "Task tags must be unique",
      ),
    memberIds: z
      .array(z.string().uuid())
      .max(50, "A task can have at most 50 members")
      .default([])
      .refine(
        (values) => new Set(values).size === values.length,
        "Task members must be unique",
      ),
  })
  .strict();

export const taskStatusTransitionSchema = z
  .object({ status: z.enum(["todo", "in_review", "done"]) })
  .strict();

export type TaskStatus = z.infer<typeof taskStatusTransitionSchema>["status"];

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

export const taskMemberCreateSchema = z
  .object({ userId: z.string().uuid() })
  .strict();

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  githubRepository: string | null;
  assetsProjectUid: string | null;
  status: "active" | "archived";
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
  reviewTaskId: string | null;
  members: ProjectMemberView[];
  capabilities: ProjectCapabilities;
};

export type ProjectAssetsLinkStatus =
  | "linked"
  | "unlinked"
  | "missing"
  | "unavailable";

export type ProjectAssetsLinkView = {
  uid: string | null;
  status: ProjectAssetsLinkStatus;
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
  creatorId: string;
  projectName: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  tags: TagView[];
  members: TaskMemberView[];
  createdAt: string;
  updatedAt: string;
};

export type TaskMemberView = {
  userId: string;
  displayName: string;
  image: string | null;
  role: "assignee";
};

export type TaskActions = {
  submitForReview: boolean;
  review: boolean;
  manageMembers: boolean;
  edit: boolean;
  delete: boolean;
  duplicate: boolean;
  comment: boolean;
};

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  projectId: z.string().uuid().optional(),
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

export type UserAuthorizationSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  resource: string;
  current: boolean;
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
  canUpdate: boolean;
  canDelete: boolean;
};
export type AvailableApplicationResource = Omit<
  ApplicationResourceView,
  "grantedScopes" | "claimCount" | "canUpdate" | "canDelete"
>;
export type ResourceSummary = { resourceId: string; name: string };
export type ResourceDetail = ResourceSummary & {
  availableScopes: string[];
  backchannelLogoutUri: string | null;
  capabilities: { update: boolean; delete: boolean };
};
export const resourceScopeChangeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    scope: z.string().trim().regex(/^[\x21\x23-\x5b\x5d-\x7e]+$/, "Enter one valid OAuth scope"),
  }),
  z.object({ action: z.literal("remove"), scope: z.string().min(1) }),
]);
export const resourceLogoutUriSchema = z.object({
  backchannelLogoutUri: z.string().trim().min(1, "Enter a logout webhook URL"),
});
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
  role: ApplicationRole | null;
  capabilities: ApplicationCapabilities;
  owners: ApplicationOwnerView[];
  resources: ApplicationResourceView[];
  availableResources: AvailableApplicationResource[];
  permissions: Array<{ permission: string; description: string }>;
  defaultPermissions: string[];
  permissionCatalogVersion: number;
  redirectUris: string[];
};

export const incidentSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const incidentStatusSchema = z.enum([
  "open",
  "investigating",
  "resolved",
]);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

export const incidentCreateSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    description: z.string().max(50_000).default(""),
    severity: incidentSeveritySchema.default("medium"),
    status: incidentStatusSchema.default("open"),
    assigneeId: z.string().uuid().nullable().default(null),
    dueDate: z.iso.date().nullable().default(null),
  })
  .strict();

export const incidentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(50_000).optional(),
    severity: incidentSeveritySchema.optional(),
    status: incidentStatusSchema.optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one incident field is required",
  );

export const incidentListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: incidentStatusSchema.optional(),
  severity: incidentSeveritySchema.optional(),
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type IncidentView = {
  id: string;
  projectId: string;
  projectName: string;
  creatorId: string;
  assigneeId: string | null;
  assignee: UserSummary | null;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  capabilities: {
    update: boolean;
  };
};

export type IncidentDetail = IncidentView & {
  comments: CommentView[];
  activity: ActivityView[];
};

export type IncidentPage = {
  incidents: IncidentView[];
  nextCursor: string | null;
};

export type CalendarEventType = "task" | "incident";

export type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  projectId: string;
  projectName: string;
  status: string;
  severity?: IncidentSeverity;
  url: string;
};

export type CalendarResponse = {
  events: CalendarEvent[];
};

export type TaskUpdateInput = {
  title?: string;
  description?: string;
  dueDate?: string | null;
  tags?: string[];
};

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(50_000).optional(),
    dueDate: z.iso.date().nullable().optional(),
    tags: z
      .array(tagNameSchema)
      .max(20)
      .refine(
        (values) => new Set(values).size === values.length,
        "Task tags must be unique",
      )
      .optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one task field is required",
  );

export const taskDuplicateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const taskBulkSchema = z.union([
  z.object({
    taskIds: z.array(z.string().uuid()).min(1).max(100),
    action: z.literal("status"),
    value: z.enum(["todo", "done"]),
  }),
  z.object({
    taskIds: z.array(z.string().uuid()).min(1).max(100),
    action: z.literal("add-tag"),
    value: tagNameSchema,
  }),
  z.object({
    taskIds: z.array(z.string().uuid()).min(1).max(100),
    action: z.literal("remove-tag"),
    value: tagNameSchema,
  }),
  z.object({
    taskIds: z.array(z.string().uuid()).min(1).max(100),
    action: z.literal("assign"),
    value: z.string().uuid(),
  }),
  z.object({
    taskIds: z.array(z.string().uuid()).min(1).max(100),
    action: z.literal("unassign"),
    value: z.string().uuid(),
  }),
]);

export type TaskBulkInput = z.infer<typeof taskBulkSchema>;
export type TaskBulkResult = {
  updated: string[];
  skipped: Array<{ id: string; reason: string }>;
};

export const taskListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["todo", "in_review", "done"]).optional(),
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  tag: tagNameSchema.optional(),
  due: z.enum(["overdue", "today", "week", "none"]).optional(),
  mine: z.coerce.boolean().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const taskTemplateCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    description: z.string().max(50_000).default(""),
    dueOffsetDays: z.number().int().min(0).max(365).nullable().default(null),
    tags: z.array(tagNameSchema).max(20).default([]),
    memberIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export const taskTemplateUpdateSchema = taskTemplateCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one template field is required",
  );

export type TaskTemplateView = {
  id: string;
  projectId: string;
  name: string;
  title: string;
  description: string;
  dueOffsetDays: number | null;
  tags: string[];
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
};

export const commentCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
    projectId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    incidentId: z.string().uuid().optional(),
    mentionIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict()
  .refine(
    (value) =>
      [value.projectId, value.taskId, value.incidentId].filter(Boolean)
        .length === 1,
    "A comment must target exactly one project, task, or incident",
  );

export const commentUpdateSchema = z
  .object({ body: z.string().trim().min(1).max(20_000) })
  .strict();

export const commentListQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CommentView = {
  id: string;
  authorId: string;
  author: UserSummary | null;
  body: string;
  projectId: string | null;
  taskId: string | null;
  incidentId: string | null;
  mentions: UserSummary[];
  editedAt: string | null;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
  deleted: boolean;
};

export type CommentPage = {
  comments: CommentView[];
  nextCursor: string | null;
};

export const activityListQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ActivityView = {
  id: string;
  projectId: string | null;
  actorId: string;
  actor: UserSummary | null;
  type: string;
  taskId: string | null;
  incidentId: string | null;
  commentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ActivityPage = {
  activity: ActivityView[];
  nextCursor: string | null;
};

export const notificationPreferenceKeys = [
  "taskAssigned",
  "reviewRequested",
  "dueSoon",
  "incidentUpdates",
  "membershipChanges",
  "mentions",
  "replies",
] as const;

export type NotificationPreferenceKey =
  (typeof notificationPreferenceKeys)[number];

export type NotificationPreferences = {
  types: Record<NotificationPreferenceKey, boolean>;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
};

export const notificationPreferencesSchema = z
  .object({
    types: z
      .object({
        taskAssigned: z.boolean(),
        reviewRequested: z.boolean(),
        dueSoon: z.boolean(),
        incidentUpdates: z.boolean(),
        membershipChanges: z.boolean(),
        mentions: z.boolean(),
        replies: z.boolean(),
      })
      .strict(),
    quietHours: z
      .object({
        enabled: z.boolean(),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .strict(),
  })
  .strict();

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  readAt: string | null;
  createdAt: string;
  actor: UserSummary | null;
  projectId: string | null;
  taskId: string | null;
  incidentId: string | null;
  commentId: string | null;
};

export type NotificationPage = {
  notifications: NotificationView[];
  nextCursor: string | null;
  unread: number;
};

export type NotificationSummary = {
  unread: number;
  latestId: string | null;
  generatedAt: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

export const pushSubscriptionSchema = z
  .object({
    endpoint: z.url().max(2048),
    keys: z
      .object({
        p256dh: z.string().min(1).max(255),
        auth: z.string().min(1).max(255),
      })
      .strict(),
    userAgent: z.string().max(500).optional(),
  })
  .strict();

export const savedFilterScopeSchema = z.enum([
  "tasks",
  "incidents",
  "users",
  "assets",
]);
export type SavedFilterScope = z.infer<typeof savedFilterScopeSchema>;

export const savedFilterCreateSchema = z
  .object({
    scope: savedFilterScopeSchema,
    name: z.string().trim().min(1).max(40),
    query: z.record(z.string(), z.unknown()),
  })
  .strict();

export const savedFilterUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    query: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one filter field is required",
  );

export type SavedFilterView = {
  id: string;
  scope: SavedFilterScope;
  name: string;
  query: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type SearchResult = {
  type: "project" | "task" | "incident" | "user";
  id: string;
  title: string;
  subtitle: string;
  url: string;
};

export type SearchResponse = {
  results: SearchResult[];
};

export const calendarQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    projectId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      (Date.parse(`${value.to}T00:00:00Z`) -
        Date.parse(`${value.from}T00:00:00Z`)) /
        86_400_000 <=
      366,
    "Calendar range cannot exceed one year",
  )
  .refine(
    (value) => value.to >= value.from,
    "Calendar end must not precede start",
  );

export const overviewResponseKeys = [
  "openTasks",
  "dueThisWeek",
  "awaitingReview",
  "openIncidents",
] as const;

export type OverviewKpis = Record<(typeof overviewResponseKeys)[number], number>;

export type OverviewResponse = {
  kpis: OverviewKpis;
  myTasks: TaskView[];
  upcoming: CalendarEvent[];
  activity: ActivityView[];
  unread: number;
};

