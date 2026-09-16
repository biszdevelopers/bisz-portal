import { apiResult } from "@/lib/api-response"
import { authenticateRequest } from "@/lib/api-auth"
import { APIError, APIResponse } from "@/lib/basis-schema"

export async function GET(request: Request) {
  const authentication = await authenticateRequest(request)
  if (authentication instanceof APIError) return apiResult(authentication)

  return apiResult(new APIResponse({ user: authentication.user }))
}
