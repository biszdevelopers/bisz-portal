import type { UserDetail } from "~/shared/contracts";
import { userUpdateSchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { apiResult } from "~/server/utils/api-response";
import {
  basisApplicationsRequest,
  requireSameOrigin,
} from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { requirePortalPermission } from "~/server/utils/authorization";
import { parseBody } from "~/server/utils/request";

type BasisUserDetail = Omit<UserDetail, "image"> & { hasPicture: boolean };

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Users.update,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const body = await parseBody(event, userUpdateSchema);
  if (body instanceof APIError) return apiResult(event, body);

  if (auth.user.id === getRouterParam(event, "userId") && body.disabled) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        "You cannot disable your own account",
        400,
        "invalid_request",
      ),
    );
  }

  const userId = encodeURIComponent(getRouterParam(event, "userId") ?? "");
  const result = await basisApplicationsRequest<{ user: BasisUserDetail }>(
    auth,
    `/management/users/${userId}`,
    { method: "PATCH", body },
  );
  if (result instanceof APIError) return apiResult(event, result);

  const issuer = process.env.BASIS_AUTH_ISSUER?.replace(/\/$/, "");
  const { hasPicture, ...user } = result.user;
  return apiResult(
    event,
    new APIResponse<{ user: UserDetail }>({
      user: {
        ...user,
        image:
          hasPicture && issuer
            ? `${issuer}/api/picture/${encodeURIComponent(user.id)}`
            : null,
      },
    }),
  );
});
