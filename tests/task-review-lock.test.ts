import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createApp,
  createRouter,
  defineEventHandler,
  getHeader,
  getRouterParam,
  readBody,
  setResponseHeader,
  setResponseStatus,
  toWebHandler,
} from "h3";
import { databasePool, useDatabase } from "../server/database/client";
import { activityEvents, projectMembers, projects, tasks } from "../server/database/schema";
import type { AuthenticatedRequest } from "../server/utils/api-auth";

const hasDatabase =
  Boolean(process.env.DATABASE_URL) &&
  (await databasePool().query("select 1").then(() => true).catch(() => false));

test.skipIf(!hasDatabase)("review locks only the submitted task", async () => {
  const db = useDatabase();
  const projectId = randomUUID();
  const userId = randomUUID();
  const firstId = randomUUID();
  const secondId = randomUUID();
  const auth: AuthenticatedRequest = {
    accessToken: "test",
    claims: { sub: userId, permissions: ["BiszPortal.all"] } as AuthenticatedRequest["claims"],
    user: { id: userId, name: "Test user", image: null },
  };
  const autoImports = {
    defineEventHandler, getHeader, getRouterParam, readBody, setResponseHeader, setResponseStatus,
  };
  const globals = globalThis as Record<string, unknown>;
  const previousGlobals = Object.fromEntries(Object.keys(autoImports).map((name) => [name, globals[name]]));

  try {
    Object.assign(globals, autoImports);
    const router = createRouter()
      .get("/tasks/:taskId", (await import("../server/api/tasks/[taskId].get")).default)
      .patch("/tasks/bulk", (await import("../server/api/tasks/bulk.patch")).default)
      .patch("/tasks/:taskId", (await import("../server/api/tasks/[taskId].patch")).default)
      .patch("/tasks/:taskId/status", (await import("../server/api/tasks/[taskId]/status.patch")).default)
      .delete("/tasks/:taskId", (await import("../server/api/tasks/[taskId].delete")).default)
      .delete("/tasks/:taskId/members/:userId", (await import("../server/api/tasks/[taskId]/members/[userId].delete")).default)
      .patch("/projects/:projectId", (await import("../server/api/projects/[projectId].patch")).default)
      .post("/projects/:projectId/tasks", (await import("../server/api/projects/[projectId]/tasks/index.post")).default);
    const app = createApp().use((event) => {
      event.context.portalAuthenticated = auth;
    }).use(router);
    const handle = toWebHandler(app);
    async function request(method: string, path: string, body?: object) {
      const response = await handle(new Request(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body && JSON.stringify(body),
      }));
      return { status: response.status, data: await response.json() };
    }

    await db.transaction(async (transaction) => {
      await transaction.insert(projects).values({
        id: projectId, name: "Task review test", slug: `review-${projectId}`, creatorId: userId,
      });
      await transaction.insert(projectMembers).values({ projectId, userId, role: "owner", permissions: [] });
      await transaction.insert(tasks).values([
        { id: firstId, projectId, creatorId: userId, title: "First task" },
        { id: secondId, projectId, creatorId: userId, title: "Second task" },
      ]);
    });

    const first = `/tasks/${firstId}`;
    const second = `/tasks/${secondId}`;
    expect(await request("PATCH", `${first}/status`, { status: "in_review" })).toMatchObject({
      status: 200,
      data: { actions: { edit: false, delete: false, manageMembers: false, review: true } },
    });
    expect(await request("GET", first)).toMatchObject({
      status: 200,
      data: { actions: { edit: false, delete: false, manageMembers: false, review: true } },
    });
    expect(await request("PATCH", first, { title: "Blocked edit" })).toMatchObject({
      status: 409, data: { error: "task_in_review" },
    });
    expect(await request("DELETE", first)).toMatchObject({
      status: 409, data: { error: "task_in_review" },
    });
    expect(await request("DELETE", `${first}/members/${userId}`)).toMatchObject({
      status: 409, data: { error: "task_in_review" },
    });
    expect(await request("PATCH", `/projects/${projectId}`, {
      name: "Renamed project", slug: `review-${projectId}`, description: "",
    })).toMatchObject({
      status: 200, data: { project: { name: "Renamed project" } },
    });
    expect(await request("POST", `/projects/${projectId}/tasks`, { title: "New task" })).toMatchObject({
      status: 201,
    });
    expect(await request("PATCH", second, { title: "Updated second task" })).toMatchObject({
      status: 200,
    });
    expect(await request("PATCH", "/tasks/bulk", { action: "status", value: "todo", taskIds: [firstId, secondId] }))
      .toMatchObject({ status: 200, data: { updated: [secondId], skipped: [{ id: firstId }] } });
    expect(await request("PATCH", `${second}/status`, { status: "in_review" })).toMatchObject({ status: 200 });
    expect(await request("PATCH", `${first}/status`, { status: "todo" })).toMatchObject({
      status: 200, data: { actions: { edit: true } },
    });
    expect(await request("PATCH", first, { title: "Unlocked edit" })).toMatchObject({ status: 200 });
    expect(await request("PATCH", second, { title: "Still locked" })).toMatchObject({
      status: 409, data: { error: "task_in_review" },
    });
  } finally {
    Object.assign(globals, previousGlobals);
    await db.transaction(async (transaction) => {
      await transaction.delete(activityEvents).where(eq(activityEvents.projectId, projectId));
      await transaction.delete(tasks).where(eq(tasks.projectId, projectId));
      await transaction.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
      await transaction.delete(projects).where(eq(projects.id, projectId));
    });
  }
});
