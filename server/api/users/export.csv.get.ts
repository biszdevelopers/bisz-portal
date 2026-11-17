import { requirePortalPermission } from "~/server/utils/authorization";
import { APIError } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { csvHeader, csvRow } from "~/server/utils/csv";

const MAX_ROWS = 1_000;

type BasisUserPage = {
  users: Array<{
    id: string;
    displayName: string | null;
    email: string;
    hasPicture: boolean;
  }>;
  pagination: { page: number; totalPages: number };
};

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(event, {
    allOf: [
      PortalPermissions.BiszPortal.Users.read,
      PortalPermissions.BiszPortal.ExportCSV.create,
    ],
  });
  if (auth instanceof APIError) {
    setResponseStatus(event, auth.status);
    return auth.toJSON();
  }
  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="users.csv"',
    "Cache-Control": "no-store",
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(csvHeader(["id", "display_name", "email"])),
        );
        let page = 1;
        let exported = 0;
        while (exported < MAX_ROWS) {
          const result = await basisApplicationsRequest<BasisUserPage>(
            auth,
            `/users?page=${page}&pageSize=100`,
          );
          if (result instanceof APIError) break;
          for (const user of result.users) {
            if (exported >= MAX_ROWS) break;
            controller.enqueue(
              encoder.encode(
                csvRow([user.id, user.displayName ?? "", user.email]),
              ),
            );
            exported += 1;
          }
          if (page >= result.pagination.totalPages) break;
          page += 1;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return sendStream(event, stream);
});
