import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { searchQuerySchema } from "~/shared/contracts";
import { searchPortal } from "~/server/services/search";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const parsed = searchQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "Invalid search",
        400,
        "invalid_request",
      ),
    );
  }
  return apiResult(
    event,
    new APIResponse({
      results: await searchPortal(auth, parsed.data.q, parsed.data.limit),
    }),
  );
});
