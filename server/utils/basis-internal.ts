import { basisPortalAudience, requiredEnvironment } from "~/server/utils/basis-auth";

export function basisInternalFetch(path: string, options: RequestInit = {}) {
  const baseUrl = requiredEnvironment("BASIS_AUTH_INTERNAL_URL").replace(/\/$/, "");
  const secret = requiredEnvironment("BASIS_AUTH_RESOURCE_SECRET");
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${secret}`);
  headers.set("x-basis-resource", encodeURIComponent(basisPortalAudience()));
  return fetch(`${baseUrl}/internal${path}`, {
    ...options,
    headers,
    redirect: "error",
    signal: options.signal ?? AbortSignal.timeout(10_000),
  });
}
