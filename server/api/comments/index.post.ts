import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { commentCreateSchema } from "~/shared/contracts";
import { parseBody } from "~/server/utils/request";
import {
  commentAccess,
  createComment,
  resolveCommentTarget,
} from "~/server/services/comments";
import { requireSameOrigin } from "~/server/utils/basis-applications";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);
  const body = await parseBody(event, commentCreateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  const target = await resolveCommentTarget(body);
  if (!target)
    return apiResult(
      event,
      new APIError("not_found", "Comment target not found", 404, "not_found"),
    );
  const access = await commentAccess(auth, target);
  if (!access.canWrite)
    return apiResult(
      event,
      new APIError("forbidden", "You cannot comment here", 403, "forbidden"),
    );
  const comment = await createComment(auth, target, access, {
    body: body.body,
    mentionIds: body.mentionIds,
  });
  return apiResult(
    event,
    new APIResponse({ comment: { id: comment.id } }, 201),
  );
});


