import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { deleteComment } from "~/server/services/comments";
import { requireSameOrigin } from "~/server/utils/basis-applications";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const comment = await deleteComment(
    auth,
    getRouterParam(event, "commentId") ?? "",
  );
  if (!comment)
    return apiResult(
      event,
      new APIError("forbidden", "The comment cannot be deleted", 403, "forbidden"),
    );
  return apiResult(event, new APIResponse({ deleted: true }));
});

