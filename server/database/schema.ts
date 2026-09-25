import { sql } from "drizzle-orm"
import { index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import type { ProjectPermission } from "../../shared/permissions"

export const projectStatus = pgEnum("project_status", ["active", "archived"])
export const projectMemberRole = pgEnum("project_member_role", ["owner", "member"])
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"])
export const incidentSeverity = pgEnum("incident_severity", ["low", "medium", "high", "critical"])
export const incidentStatus = pgEnum("incident_status", ["open", "investigating", "resolved"])

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  status: projectStatus("status").notNull().default("active"),
  creatorId: uuid("creator_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const projectMembers = pgTable("project_members", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull(),
  role: projectMemberRole("role").notNull().default("member"),
  permissions: jsonb("permissions").$type<ProjectPermission[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }),
  uniqueIndex("project_members_one_owner_idx").on(table.projectId).where(sql`${table.role} = 'owner'`),
  index("project_members_user_idx").on(table.userId),
])

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: taskStatus("status").notNull().default("todo"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("tasks_project_status_idx").on(table.projectId, table.status)])

export const incidents = pgTable("incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  severity: incidentSeverity("severity").notNull().default("medium"),
  status: incidentStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("incidents_project_status_idx").on(table.projectId, table.status)])
