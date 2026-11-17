import { and, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { incidentUpdateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { useDatabase } from "~/server/database/client";
import { incidents, projectMembers, projects } from "~/server/database/schema";
import { recordActivity } from "~/server/services/activity";
import {
  createNotifications,
  projectMemberIds,
} from "~/server/services/notifications";
import { getIncidentView } from "~/server/services/incidents";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Incidents.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const incidentId = getRouterParam(event, "incidentId") ?? "";
  const body = await parseBody(event, incidentUpdateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const [existing] = await useDatabase()
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!existing)
    return apiResult(
      event,
      new APIError("not_found", "Incident not found", 404, "not_found"),
    );

  const access = await requireProjectCapability(
    auth,
    existing.projectId,
    "writeIncidents",
  );
  if (access instanceof APIError) return apiResult(event, access);

  if (body.assigneeId) {
    const [member] = await useDatabase()
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, existing.projectId),
          eq(projectMembers.userId, body.assigneeId),
        ),
      )
      .limit(1);
    if (!member)
      return apiResult(
        event,
        new APIError(
          "invalid_assignee",
          "The assignee must be a project member",
          400,
          "invalid_assignee",
        ),
      );
  }

  const nextStatus = body.status ?? existing.status;
  const resolvedAt =
    nextStatus === "resolved"
      ? existing.resolvedAt ?? new Date()
      : null;

  const db = useDatabase();
  const [updated] = await db
    .update(incidents)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.severity !== undefined ? { severity: body.severity } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.assigneeId !== undefined
        ? { assigneeId: body.assigneeId }
        : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
      resolvedAt,
      updatedAt: new Date(),
    })
    .where(eq(incidents.id, incidentId))
    .returning();
  if (!updated)
    return apiResult(
      event,
      new APIError("not_found", "Incident not found", 404, "not_found"),
    );

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, existing.projectId))
    .limit(1);

  await recordActivity(db, {
    projectId: existing.projectId,
    actorId: auth.user.id,
    type:
      body.status !== undefined && body.status !== existing.status
        ? nextStatus === "resolved"
          ? "incident_resolved"
          : "incident_status_changed"
        : body.assigneeId !== undefined
          ? "incident_assigned"
          : "incident_updated",
    incidentId,
    metadata: {
      title: updated.title,
      ...(body.status !== undefined
        ? { from: existing.status, to: body.status }
        : {}),
      ...(body.assigneeId !== undefined
        ? { from: existing.assigneeId, to: body.assigneeId }
        : {}),
    },
  });

  const notifications = [];
  if (
    body.assigneeId !== undefined &&
    body.assigneeId !== existing.assigneeId &&
    body.assigneeId &&
    body.assigneeId !== auth.user.id
  ) {
    notifications.push({
      userId: body.assigneeId,
      type: "incident_assigned" as const,
      title: `Assigned incident: ${updated.title}`,
      body: project?.name ?? "",
      url: `/incidents/${incidentId}`,
      projectId: existing.projectId,
      incidentId,
      actorId: auth.user.id,
      dedupeKey: `incident_assigned:${incidentId}:${body.assigneeId}:${Date.now()}`,
    });
  }
  if (nextStatus === "resolved" && existing.status !== "resolved") {
    const recipients = [
      ...new Set(
        [existing.creatorId, existing.assigneeId].filter(
          (value): value is string =>
            Boolean(value) && value !== auth.user.id,
        ),
      ),
    ];
    notifications.push(
      ...recipients.map((userId) => ({
        userId,
        type: "incident_resolved" as const,
        title: `Resolved incident: ${updated.title}`,
        body: project?.name ?? "",
        url: `/incidents/${incidentId}`,
        projectId: existing.projectId,
        incidentId,
        actorId: auth.user.id,
        dedupeKey: `incident_resolved:${incidentId}:${userId}`,
      })),
    );
  }
  if (notifications.length) await createNotifications(db, notifications);

  const view = await getIncidentView(auth, incidentId);
  return apiResult(event, new APIResponse({ incident: view }));
});
