import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import {
  markNotificationsRead,
  notificationSummary,
} from "~/server/services/notifications";

const schema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  })
  .strict();

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, schema);
  if (body instanceof APIError) return apiResult(event, body);
  await markNotificationsRead(auth.user.id, body.ids);
  return apiResult(
    event,
    new APIResponse({ summary: await notificationSummary(auth.user.id) }),
  );
});
