import { and, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { incidentCreateSchema } from "~/shared/contracts";
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
    PortalPermissions.BiszPortal.Incidents.create,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const body = await parseBody(event, incidentCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const access = await requireProjectCapability(
    auth,
    body.projectId,
    "writeIncidents",
  );
  if (access instanceof APIError) return apiResult(event, access);

  if (body.assigneeId) {
    const [member] = await useDatabase()
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, body.projectId),
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

  const db = useDatabase();
  const [incident] = await db
    .insert(incidents)
    .values({
      projectId: body.projectId,
      creatorId: auth.user.id,
      assigneeId: body.assigneeId,
      title: body.title,
      description: body.description,
      severity: body.severity,
      status: body.status,
      dueDate: body.dueDate,
      resolvedAt: body.status === "resolved" ? new Date() : null,
    })
    .returning();
  if (!incident)
    return apiResult(
      event,
      new APIError(
        "incident_create_failed",
        "The incident could not be created",
        500,
        "incident_create_failed",
      ),
    );

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, body.projectId))
    .limit(1);

  await recordActivity(db, {
    projectId: body.projectId,
    actorId: auth.user.id,
    type: "incident_created",
    incidentId: incident.id,
    metadata: { title: incident.title, severity: incident.severity },
  });

  const memberIds = await projectMemberIds(body.projectId);
  const recipients = memberIds.filter((userId) => userId !== auth.user.id);
  await createNotifications(db, [
    ...recipients.slice(0, 100).map((userId) => ({
      userId,
      type: "incident_created" as const,
      title: `New ${incident.severity} incident: ${incident.title}`,
      body: project?.name ?? "",
      url: `/incidents/${incident.id}`,
      projectId: body.projectId,
      incidentId: incident.id,
      actorId: auth.user.id,
      dedupeKey: `incident_created:${incident.id}:${userId}`,
    })),
    ...(body.assigneeId && body.assigneeId !== auth.user.id
      ? [
          {
            userId: body.assigneeId,
            type: "incident_assigned" as const,
            title: `Assigned incident: ${incident.title}`,
            body: project?.name ?? "",
            url: `/incidents/${incident.id}`,
            projectId: body.projectId,
            incidentId: incident.id,
            actorId: auth.user.id,
            dedupeKey: `incident_assigned:${incident.id}:${body.assigneeId}`,
          },
        ]
      : []),
  ]);

  const view = await getIncidentView(auth, incident.id);
  return apiResult(event, new APIResponse({ incident: view }, 201));
});
