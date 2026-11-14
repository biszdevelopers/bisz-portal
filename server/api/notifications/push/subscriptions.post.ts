import { count, eq } from "drizzle-orm";
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { pushSubscriptionSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { useDatabase } from "~/server/database/client";
import { pushSubscriptions } from "~/server/database/schema";
import {
  decodePushKey,
  sealPushSecret,
  validatePushEndpoint,
} from "~/server/utils/web-push";
import { pushConfigured, processPushQueue } from "~/server/services/push";

const MAX_SUBSCRIPTIONS = 5;

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  if (!pushConfigured())
    return apiResult(
      event,
      new APIError(
        "push_not_configured",
        "Push notifications are not configured",
        503,
        "push_not_configured",
      ),
    );
  const body = await parseBody(event, pushSubscriptionSchema);
  if (body instanceof APIError) return apiResult(event, body);
  if (!validatePushEndpoint(body.endpoint))
    return apiResult(
      event,
      new APIError(
        "invalid_push_endpoint",
        "The push endpoint is not supported",
        400,
        "invalid_push_endpoint",
      ),
    );
  if (!decodePushKey(body.keys.p256dh, 65) || !decodePushKey(body.keys.auth, 16))
    return apiResult(
      event,
      new APIError(
        "invalid_push_keys",
        "The push subscription keys are invalid",
        400,
        "invalid_push_keys",
      ),
    );

  const db = useDatabase();
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, body.endpoint))
    .limit(1);
  if (!existing || existing.userId !== auth.user.id) {
    const [total] = await db
      .select({ value: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, auth.user.id));
    if (Number(total?.value ?? 0) >= MAX_SUBSCRIPTIONS)
      return apiResult(
        event,
        new APIError(
          "too_many_subscriptions",
          "Disable notifications on another device first",
          409,
          "too_many_subscriptions",
        ),
      );
  }

  await db
    .insert(pushSubscriptions)
    .values({
      userId: auth.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: sealPushSecret(body.keys.auth, auth.user.id),
      userAgent:
        body.userAgent ??
        getHeader(event, "user-agent")?.slice(0, 500) ??
        null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: auth.user.id,
        p256dh: body.keys.p256dh,
        auth: sealPushSecret(body.keys.auth, auth.user.id),
        userAgent:
          body.userAgent ??
          getHeader(event, "user-agent")?.slice(0, 500) ??
          null,
        lastSeenAt: new Date(),
        failureCount: 0,
      },
    });
  void processPushQueue();
  return apiResult(event, new APIResponse({ subscribed: true }, 201));
});
