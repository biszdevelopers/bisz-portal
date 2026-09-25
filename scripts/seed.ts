import { eq } from "drizzle-orm"
import { z } from "zod"
import { closeDatabase, useDatabase } from "../server/database/client"
import { projectMembers, projects, tasks } from "../server/database/schema"
import { projectPermissionValues } from "../shared/permissions"

const seedOwnerId = z.string().uuid().parse(process.env.PORTAL_SEED_OWNER_ID)
const db = useDatabase()
const projectId = "10000000-0000-4000-8000-000000000001"

try {
  await db.transaction(async (transaction) => {
    await transaction.insert(projects).values({
      id: projectId,
      name: "Portal Launch",
      slug: "portal-launch",
      description: "# Portal Launch\n\nCoordinate the first production-ready release of the Basis Portal.",
      creatorId: seedOwnerId,
    }).onConflictDoUpdate({
      target: projects.id,
      set: { name: "Portal Launch", slug: "portal-launch", updatedAt: new Date() },
    })

    await transaction.insert(projectMembers).values({
      projectId,
      userId: seedOwnerId,
      role: "owner",
      permissions: [...projectPermissionValues],
    }).onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role: "owner", permissions: [...projectPermissionValues], updatedAt: new Date() },
    })

    const seededTasks = [
      { id: "20000000-0000-4000-8000-000000000001", title: "Confirm launch checklist", status: "in_progress" as const, description: "Review owners and blockers before launch." },
      { id: "20000000-0000-4000-8000-000000000002", title: "Publish support guide", status: "todo" as const, description: "Prepare the first-line support handoff." },
      { id: "20000000-0000-4000-8000-000000000003", title: "Validate authentication", status: "done" as const, description: "Confirm production OIDC and portal session handling." },
    ]

    for (const task of seededTasks) {
      await transaction.insert(tasks).values({ ...task, projectId }).onConflictDoUpdate({
        target: tasks.id,
        set: { projectId, title: task.title, description: task.description, status: task.status, updatedAt: new Date() },
      })
    }
  })

  const linkedTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId))
  console.info(`Seeded Portal Launch with ${linkedTasks.length} linked tasks.`)
} finally {
  await closeDatabase()
}
