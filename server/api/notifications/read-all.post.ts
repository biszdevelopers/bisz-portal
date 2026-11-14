import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import {
  markNotificationsRead,
  notificationSummary,
} from "~/server/services/notifications";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  await markNotificationsRead(auth.user.id);
  return apiResult(
    event,
    new APIResponse({ summary: await notificationSummary(auth.user.id) }),
  );
});
