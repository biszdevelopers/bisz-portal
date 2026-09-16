import { APIError, APIResponse } from "@/lib/basis-schema"

export function apiResult(result: APIResponse<Record<string, unknown>> | APIError) {
  const headers = new Headers(result instanceof APIResponse ? result.headers : undefined)
  headers.set("Cache-Control", "no-store")

  return Response.json(result.toJSON(), {
    status: result.status,
    headers,
  })
}
