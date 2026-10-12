import type { H3Event } from "h3";
import type { AuthenticatedRequest } from "~/server/utils/api-auth";
import { APIError } from "~/server/utils/basis-schema";
import { basisPortalOrigin } from "~/server/utils/basis-auth";

export function requireSameOrigin(event: H3Event) {
  const origin = getHeader(event, "origin");
  const fetchSite = getHeader(event, "sec-fetch-site");
  if (
    (origin && origin !== basisPortalOrigin()) ||
    fetchSite === "cross-site"
  ) {
    return new APIError(
      "forbidden",
      "Cross-origin application changes are not allowed",
      403,
      "forbidden",
    );
  }
}

export async function basisApplicationsRequest<T>(
  auth: AuthenticatedRequest,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T | APIError> {
  const baseUrl = process.env.BASIS_AUTH_INTERNAL_URL;
  const token = process.env.BASIS_AUTH_INTERNAL_TOKEN;
  if (!baseUrl || !token)
    throw new Error(
      "BASIS_AUTH_INTERNAL_URL and BASIS_AUTH_INTERNAL_TOKEN are required",
    );
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/internal${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "x-basis-actor-token": `Bearer ${auth.accessToken}`,
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const code =
      typeof payload.error === "string" ? payload.error : "basis_auth_error";
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "Basis Auth rejected the application request";
    return new APIError(code, message, response.status, code);
  }
  return payload as T;
}
