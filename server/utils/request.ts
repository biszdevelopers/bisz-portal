import type { H3Event } from "h3"
import type { ZodType } from "zod"
import { APIError } from "~/server/utils/basis-schema"

export async function parseBody<T>(event: H3Event, schema: ZodType<T>): Promise<T | APIError> {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) {
    return new APIError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request", 400, "invalid_request")
  }
  return parsed.data
}
