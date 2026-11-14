import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { notificationPreferencesSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "~/server/services/notifications";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, notificationPreferencesSchema);
  if (body instanceof APIError) return apiResult(event, body);
  await saveNotificationPreferences(auth.user.id, body);
  return apiResult(
    event,
    new APIResponse({
      preferences: await getNotificationPreferences(auth.user.id),
    }),
  );
});
