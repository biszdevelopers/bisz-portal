import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import {
  notificationSummary,
  sweepDueNotifications,
} from "~/server/services/notifications";
import { processPushQueue } from "~/server/services/push";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  await sweepDueNotifications(auth.user.id);
  void processPushQueue();
  return apiResult(event, new APIResponse(await notificationSummary(auth.user.id)));
});
