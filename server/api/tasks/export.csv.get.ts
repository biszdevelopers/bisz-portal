import { requirePortalPermission } from "~/server/utils/authorization";
import { APIError } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { taskListQuerySchema } from "~/shared/contracts";
import { listTasks, visibleTaskProjectIds } from "~/server/services/tasks";
import { csvHeader, csvRow } from "~/server/utils/csv";

const MAX_ROWS = 10_000;

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Tasks.read,
  );
  if (auth instanceof APIError) {
    setResponseStatus(event, auth.status);
    return auth.toJSON();
  }
  const parsed = taskListQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return { error: "invalid_request", message: "Invalid export filters" };
  }
  const projectIds = await visibleTaskProjectIds(auth);
  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="tasks.csv"',
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
          const page = await listTasks(auth, {
            ...parsed.data,
            projectIds,
            cursor,
            limit: 200,
          });
          if (!headerWritten) {
            controller.enqueue(
              encoder.encode(
                csvHeader([
                  "id",
                  "title",
                  "project",
                  "status",
                  "due_date",
                  "tags",
                  "assignees",
                  "created_at",
                ]),
              ),
            );
            headerWritten = true;
          }
          for (const task of page.tasks) {
            if (exported >= MAX_ROWS) break;
            controller.enqueue(
              encoder.encode(
                csvRow([
                  task.id,
                  task.title,
                  task.projectName,
                  task.status,
                  task.dueDate ?? "",
                  task.tags.map((tag) => tag.name).join(";"),
                  task.members.map((member) => member.displayName).join(";"),
                  task.createdAt,
                ]),
              ),
            );
            exported += 1;
          }
          if (!page.nextCursor || !page.tasks.length) break;
          cursor = page.nextCursor;
        }
        if (exported >= MAX_ROWS) {
          controller.enqueue(
            encoder.encode(
              csvRow(["", "", "", "", "", "", "truncated", String(MAX_ROWS)]),
            ),
          );
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return sendStream(event, stream);
});
