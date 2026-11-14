import { getRequestIP, setResponseHeaders, setResponseStatus } from "h3";
import { rateLimits, type FixedWindowLimiter } from "~/server/utils/rate-limit";

function limiterFor(method: string, path: string): FixedWindowLimiter | null {
  if (path.startsWith("/api/comments") && method !== "GET")
    return rateLimits.comments;
  if (path.startsWith("/api/search") && method === "GET")
    return rateLimits.search;
  if (path.startsWith("/api/notifications/push") && method !== "GET")
    return rateLimits.push;
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth/")
  ) {
    return rateLimits.mutations;
  }
  return null;
}

export default defineEventHandler(async (event) => {
  const method = event.method.toUpperCase();
  const path = event.path.split("?")[0] ?? event.path;
  const limiter = limiterFor(method, path);
  if (!limiter) return;

  const session = await getUserSession(event).catch(() => null);
  const key =
    typeof session?.user?.id === "string"
      ? `user:${session.user.id}`
      : `ip:${getRequestIP(event, { xForwardedFor: true }) ?? "unknown"}`;
  const result = limiter.take(key);
  limiter.prune();
  if (result.allowed) return;

  setResponseStatus(event, 429);
  setResponseHeaders(event, {
    "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
    "Cache-Control": "no-store",
  });
  return {
    status: 429,
    code: "rate_limited",
    error: "rate_limited",
    error_description: "Too many requests. Try again shortly.",
  };
});
