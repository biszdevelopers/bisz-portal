import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import {
  listNotifications,
  sweepDueNotifications,
} from "~/server/services/notifications";
import { processPushQueue } from "~/server/services/push";

const querySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(["true", "false"]).optional(),
});

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    return apiResult(
      event,
      new APIError("invalid_request", "Invalid notification query", 400, "invalid_request"),
    );
  }
  await sweepDueNotifications(auth.user.id);
  void processPushQueue();
  const page = await listNotifications({
    userId: auth.user.id,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
    unreadOnly: parsed.data.unread === "true",
  });
  return apiResult(event, new APIResponse(page));
});
