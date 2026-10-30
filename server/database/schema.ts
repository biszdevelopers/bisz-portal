import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
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
  "in_progress",
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
      sql`char_length(${table.name}) between 1 and 64 and ${table.name} !~ '\\s' and ${table.name} = lower(${table.name})`,
    ),
  ],
);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  githubRepository: text("github_repository"),
  status: projectStatus("status").notNull().default("active"),
  creatorId: uuid("creator_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  },
  (table) => [
    index("tasks_project_status_idx").on(table.projectId, table.status),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    severity: incidentSeverity("severity").notNull().default("medium"),
    status: incidentStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("incidents_project_status_idx").on(table.projectId, table.status),
  ],
);
