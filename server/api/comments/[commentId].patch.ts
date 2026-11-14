import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { commentUpdateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import { updateComment } from "~/server/services/comments";
import { requireSameOrigin } from "~/server/utils/basis-applications";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, commentUpdateSchema);
  if (body instanceof APIError) return apiResult(event, body);
  const comment = await updateComment(
    auth,
    getRouterParam(event, "commentId") ?? "",
    body.body,
  );
  if (!comment)
    return apiResult(
      event,
      new APIError("forbidden", "The comment cannot be edited", 403, "forbidden"),
    );
  return apiResult(event, new APIResponse({ comment: { id: comment.id } }));
});

