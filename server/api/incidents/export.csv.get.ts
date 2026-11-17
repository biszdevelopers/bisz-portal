import { apiResult } from "~/server/utils/api-response";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { APIError } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { incidentListQuerySchema } from "~/shared/contracts";
import {
  listIncidents,
  visibleIncidentProjectIds,
} from "~/server/services/incidents";
import { csvHeader, csvRow } from "~/server/utils/csv";

const MAX_ROWS = 10_000;

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, {
    allOf: [
      PortalPermissions.BiszPortal.Incidents.read,
      PortalPermissions.BiszPortal.ExportCSV.create,
    ],
  });
  if (auth instanceof APIError) return apiResult(event, auth);
  const parsed = incidentListQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return { error: "invalid_request", message: "Invalid export filters" };
  }
  if (parsed.data.projectId) {
    const access = await requireProjectCapability(
      auth,
      parsed.data.projectId,
      "readIncidents",
    );
    if (access instanceof APIError) return apiResult(event, access);
  }
  const projectIds = await visibleIncidentProjectIds(auth);
  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="incidents.csv"',
    "Cache-Control": "no-store",
  });

  const encoder = new TextEncoder();
  let cursor = parsed.data.cursor;
  let exported = 0;
  let headerWritten = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (exported < MAX_ROWS) {
          const page = await listIncidents(auth, {
            ...parsed.data,
            projectIds,
            cursor,
            limit: 100,
          });
          if (!headerWritten) {
            controller.enqueue(
              encoder.encode(
                csvHeader([
                  "id",
                  "title",
                  "project",
                  "severity",
                  "status",
                  "assignee",
                  "due_date",
                  "created_at",
                ]),
              ),
            );
            headerWritten = true;
          }
          for (const incident of page.incidents) {
            if (exported >= MAX_ROWS) break;
            controller.enqueue(
              encoder.encode(
                csvRow([
                  incident.id,
                  incident.title,
                  incident.projectName,
                  incident.severity,
                  incident.status,
                  incident.assignee?.displayName ?? "",
                  incident.dueDate ?? "",
                  incident.createdAt,
                ]),
              ),
            );
            exported += 1;
          }
          if (!page.nextCursor || !page.incidents.length) break;
          cursor = page.nextCursor;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return sendStream(event, stream);
});
