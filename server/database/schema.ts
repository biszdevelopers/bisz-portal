import { sql } from "drizzle-orm";
import {
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ProjectPermission } from "../../shared/permissions";

export const projectStatus = pgEnum("project_status", ["active", "archived"]);
export const projectMemberRole = pgEnum("project_member_role", [
  "owner",
  "member",
]);
export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_review",
  "done",
]);
export const tagColor = pgEnum("tag_color", [
  "blue",
  "green",
  "amber",
  "red",
  "gray",
  "purple",
]);
export const incidentSeverity = pgEnum("incident_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);
export const incidentStatus = pgEnum("incident_status", [
  "open",
  "investigating",
  "resolved",
]);
export const notificationType = pgEnum("notification_type", [
  "task_assigned",
  "review_requested",
  "due_soon",
  "due_overdue",
  "incident_created",
  "incident_assigned",
  "incident_resolved",
  "membership_added",
  "membership_removed",
  "permissions_changed",
  "comment_mention",
  "comment_reply",
]);
export const activityType = pgEnum("activity_type", [
  "project_created",
  "project_updated",
  "project_archived",
  "project_unarchived",
  "member_added",
  "member_removed",
  "member_permissions_changed",
  "task_created",
  "task_updated",
  "task_status_changed",
  "task_deleted",
  "task_duplicated",
  "task_members_added",
  "task_members_removed",
  "task_tags_changed",
  "incident_created",
  "incident_updated",
  "incident_status_changed",
  "incident_assigned",
  "incident_resolved",
  "comment_created",
  "comment_updated",
  "comment_deleted",
  "asset_link_repaired",
  "template_created",
  "template_applied",
]);
export const pushDeliveryStatus = pgEnum("push_delivery_status", [
  "pending",
  "sent",
  "failed",
  "dead",
]);

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export type NotificationPreferenceKey =
  | "taskAssigned"
  | "reviewRequested"
  | "dueSoon"
  | "incidentUpdates"
  | "membershipChanges"
  | "mentions"
  | "replies";

export type NotificationPreferences = Partial<
  Record<NotificationPreferenceKey, boolean>
> & {
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
  };
};

export type SavedFilterQuery = Record<string, unknown>;

export const assetConnections = pgTable("asset_connections", {
  userId: uuid("user_id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalAuthTokens = pgTable("portal_auth_tokens", {
  sessionId: text("session_id").primaryKey(),
  userId: uuid("user_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("portal_auth_tokens_user_id_idx").on(table.userId)]);

export const portalRevokedAccessTokens = pgTable("portal_revoked_access_tokens", {
  jti: text("jti").primaryKey(),
  validAfter: timestamp("valid_after", { withTimezone: true }).notNull(),
  retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),
}, (table) => [index("portal_revoked_access_tokens_retention_idx").on(table.retainUntil)]);

export const portalUserLogouts = pgTable("portal_user_logouts", {
  userId: uuid("user_id").primaryKey(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
});

export const tags = pgTable(
  "tags",
  {
    name: text("name").primaryKey(),
    color: tagColor("color").notNull(),
    creatorId: uuid("creator_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "tags_name_format_check",
      sql`char_length(${table.name}) between 1 and 64 and ${table.name} !~ '[[:space:]]' and ${table.name} = lower(${table.name})`,
    ),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull().default(""),
    githubRepository: text("github_repository"),
    assetsProjectUid: text("assets_project_uid").unique(),
    status: projectStatus("status").notNull().default("active"),
    creatorId: uuid("creator_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(${sql.raw("name")}, '') || ' ' || coalesce(${sql.raw("description")}, ''))`,
    ),
  },
  (table) => [
    index("projects_search_idx").using("gin", table.searchVector),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    role: projectMemberRole("role").notNull().default("member"),
    permissions: jsonb("permissions")
      .$type<ProjectPermission[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    uniqueIndex("project_members_one_owner_idx")
      .on(table.projectId)
      .where(sql`${table.role} = 'owner'`),
    index("project_members_user_idx").on(table.userId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("todo"),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(${sql.raw("title")}, '') || ' ' || coalesce(${sql.raw("description")}, ''))`,
    ),
  },
  (table) => [
    index("tasks_project_status_idx").on(table.projectId, table.status),
    index("tasks_due_date_idx")
      .on(table.dueDate, table.status)
      .where(sql`${table.dueDate} is not null`),
    index("tasks_search_idx").using("gin", table.searchVector),
  ],
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagName: text("tag_name")
      .notNull()
      .references(() => tags.name, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.tagName] }),
    index("task_tags_tag_name_idx").on(table.tagName),
  ],
);

export const taskMembers = pgTable(
  "task_members",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.userId] }),
    index("task_members_user_idx").on(table.userId),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id").notNull(),
    assigneeId: uuid("assignee_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    severity: incidentSeverity("severity").notNull().default("medium"),
    status: incidentStatus("status").notNull().default("open"),
    dueDate: date("due_date"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(${sql.raw("title")}, '') || ' ' || coalesce(${sql.raw("description")}, ''))`,
    ),
  },
  (table) => [
    index("incidents_project_status_idx").on(table.projectId, table.status),
    index("incidents_assignee_status_idx").on(table.assigneeId, table.status),
    index("incidents_due_date_idx").on(table.dueDate),
    index("incidents_search_idx").using("gin", table.searchVector),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "comments_single_target_check",
      sql`num_nonnulls(${table.projectId}, ${table.taskId}, ${table.incidentId}) = 1`,
    ),
    index("comments_project_idx").on(table.projectId, table.createdAt),
    index("comments_task_idx").on(table.taskId, table.createdAt),
    index("comments_incident_idx").on(table.incidentId, table.createdAt),
    index("comments_author_idx").on(table.authorId),
  ],
);

export const commentMentions = pgTable(
  "comment_mentions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index("comment_mentions_user_idx").on(table.userId),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id").notNull(),
    type: activityType("type").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "set null",
    }),
    commentId: uuid("comment_id").references(() => comments.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_project_time_idx").on(table.projectId, table.createdAt),
    index("activity_time_idx").on(table.createdAt),
    index("activity_actor_time_idx").on(table.actorId, table.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url").notNull(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "cascade",
    }),
    commentId: uuid("comment_id").references(() => comments.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (table) => [
    uniqueIndex("notifications_user_dedupe_idx").on(
      table.userId,
      table.dedupeKey,
    ),
    index("notifications_user_read_idx").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
    index("notifications_user_time_idx").on(table.userId, table.createdAt),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    failureCount: integer("failure_count").notNull().default(0),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)],
);

export const pushDeliveries = pgTable(
  "push_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    status: pushDeliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("push_deliveries_pending_idx").on(table.status, table.nextAttemptAt),
    index("push_deliveries_notification_idx").on(table.notificationId),
  ],
);

export const taskTemplates = pgTable(
  "task_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dueOffsetDays: integer("due_offset_days"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    memberIds: jsonb("member_ids").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("task_templates_project_name_idx").on(
      table.projectId,
      table.name,
    ),
    index("task_templates_project_idx").on(table.projectId),
  ],
);

export const savedFilters = pgTable(
  "saved_filters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    scope: text("scope").notNull(),
    name: text("name").notNull(),
    query: jsonb("query").$type<SavedFilterQuery>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("saved_filters_user_scope_name_idx").on(
      table.userId,
      table.scope,
      table.name,
    ),
    index("saved_filters_user_scope_idx").on(table.userId, table.scope),
  ],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  notificationPreferences: jsonb("notification_preferences")
    .$type<NotificationPreferences>()
    .notNull()
    .default({}),
  lastDueSweepAt: timestamp("last_due_sweep_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type NotificationRow = typeof notifications.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type ActivityRow = typeof activityEvents.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
