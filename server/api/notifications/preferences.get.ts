import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { getNotificationPreferences } from "~/server/services/notifications";
import { pushConfigured } from "~/server/services/push";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  return apiResult(
    event,
    new APIResponse({
      preferences: await getNotificationPreferences(auth.user.id),
      pushConfigured: pushConfigured(),
    }),
  );
});
