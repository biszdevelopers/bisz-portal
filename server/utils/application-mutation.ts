import type { H3Event } from "h3"
import type { Permission } from "@basis/schema/permissions"
import type { ZodType } from "zod"
import type { ApplicationDetail } from "~/shared/contracts"
import { apiResult } from "~/server/utils/api-response"
import { basisApplicationsRequest } from "~/server/utils/basis-applications"
import { requireApplicationRequest } from "~/server/utils/application-route"
import { APIError, APIResponse } from "~/server/utils/basis-schema"
import { parseBody } from "~/server/utils/request"

export async function proxyApplicationMutation(
  event: H3Event,
  permission: Permission,
  suffix: string,
  method: string,
  schema?: ZodType,
) {
  const auth = await requireApplicationRequest(event, permission, true)
  if (auth instanceof APIError) return apiResult(event, auth)
  const body = schema ? await parseBody(event, schema) : undefined
  if (body instanceof APIError) return apiResult(event, body)
  const id = encodeURIComponent(getRouterParam(event, "clientId") ?? "")
  const result = await basisApplicationsRequest<{ application: ApplicationDetail }>(auth, `/applications/${id}${suffix}`, { method, body })
  return apiResult(event, result instanceof APIError ? result : new APIResponse(result))
}
