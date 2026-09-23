import type { H3Event } from "h3"

import { APIError, APIResponse } from "~/server/utils/basis-schema"

export function apiResult(event: H3Event, result: APIResponse<Record<string, unknown>> | APIError) {
  const headers = new Headers(result instanceof APIResponse ? result.headers : undefined)
  headers.set("Cache-Control", "no-store")

  setResponseStatus(event, result.status)

  for (const [name, value] of headers) {
    setResponseHeader(event, name, value)
  }

  return result.toJSON()
}
