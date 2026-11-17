import { apiResult } from "~/server/utils/api-response";
import { requirePortalPermission } from "~/server/utils/authorization";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { PortalPermissions } from "~/shared/permissions";
import { calendarQuerySchema } from "~/shared/contracts";
import { calendarEvents } from "~/server/services/calendar";

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Calendar.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const parsed = calendarQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "Invalid calendar range",
        400,
        "invalid_request",
      ),
    );
  }
  return apiResult(
    event,
    new APIResponse({ events: await calendarEvents(auth, parsed.data) }),
  );
});
