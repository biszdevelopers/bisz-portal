import { z } from "zod"
import { projectPermissionValues, type ProjectCapabilities, type ProjectPermission } from "~/shared/permissions"

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional().or(z.literal("")),
  description: z.string().max(50_000).default(""),
})

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  description: z.string().max(50_000),
})

export const memberCreateSchema = z.object({
  userId: z.string().uuid(),
  permissions: z.array(z.enum(projectPermissionValues as [ProjectPermission, ...ProjectPermission[]])).default([]),
})

export const memberUpdateSchema = z.object({
  permissions: z.array(z.enum(projectPermissionValues as [ProjectPermission, ...ProjectPermission[]])),
})

export type ProjectSummary = {
  id: string
  name: string
  slug: string
  description: string
  status: "active" | "archived"
  creatorId: string
  createdAt: string
  updatedAt: string
  memberCount: number
  taskCount: number
  completedTaskCount: number
  capabilities: ProjectCapabilities
}

export type ProjectMemberView = {
  userId: string
  displayName: string
  image: string | null
  role: "owner" | "member"
  permissions: ProjectPermission[]
  joinedAt: string
}

export type TaskView = {
  id: string
  projectId: string
  projectName: string
  title: string
  description: string
  status: "todo" | "in_progress" | "done"
  dueDate: string | null
  createdAt: string
  updatedAt: string
}
