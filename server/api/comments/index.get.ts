import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { commentListQuerySchema } from "~/shared/contracts";
import {
  commentAccess,
  listComments,
  resolveCommentTarget,
} from "~/server/services/comments";

export default defineEventHandler(async (event) => {
  const auth = await authenticateRequest(event);
  if (auth instanceof APIError) return apiResult(event, auth);
  const parsed = commentListQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "Invalid comment target",
        400,
        "invalid_request",
      ),
    );
  }
  const target = await resolveCommentTarget(parsed.data);
  if (!target)
    return apiResult(
      event,
      new APIError("not_found", "Comment target not found", 404, "not_found"),
    );
  const access = await commentAccess(auth, target);
  if (!access.canRead)
    return apiResult(
      event,
      new APIError("forbidden", "You cannot read these comments", 403, "forbidden"),
    );
  const page = await listComments(auth, target, access, parsed.data);
  return apiResult(event, new APIResponse(page));
});


