import type { H3Event } from "h3";
import type { ZodType } from "zod";
import { PortalPermissions } from "~/shared/permissions";
import { apiResult } from "~/server/utils/api-response";
import { requireApplicationRequest } from "~/server/utils/application-route";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { parseBody } from "~/server/utils/request";

export async function proxyResourceRequest(
  event: H3Event,
  action: "read" | "update" | "delete",
  method: "GET" | "PATCH" | "POST" | "PUT" | "DELETE",
  suffix = "",
  schema?: ZodType,
) {
  const auth = await requireApplicationRequest(
    event,
    Object.values(PortalPermissions.BiszPortal.Resources[action]),
    method !== "GET",
  );
  if (auth instanceof APIError) return apiResult(event, auth);
  const body = schema ? await parseBody(event, schema) : undefined;
  if (body instanceof APIError) return apiResult(event, body);

  const resourceId = getRouterParam(event, "resourceId", { decode: true });
  const path = resourceId === undefined
    ? "/resources"
    : `/resources/${encodeURIComponent(resourceId)}${suffix}`;
  const result = await basisApplicationsRequest<Record<string, unknown>>(auth, path, { method, body });
  return apiResult(event, result instanceof APIError ? result : new APIResponse(result));
}
