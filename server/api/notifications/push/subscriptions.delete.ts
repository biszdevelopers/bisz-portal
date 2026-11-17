import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { pushSubscriptions } from "~/server/database/schema";

const schema = z.object({ endpoint: z.url().max(2048) }).strict();

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, schema);
  if (body instanceof APIError) return apiResult(event, body);
  await useDatabase()
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, auth.user.id),
        eq(pushSubscriptions.endpoint, body.endpoint),
      ),
    );
  return apiResult(event, new APIResponse({ subscribed: false }));
});
