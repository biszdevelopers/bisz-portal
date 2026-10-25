import type { UserDetail } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { apiResult } from "~/server/utils/api-response";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { requirePortalPermission } from "~/server/utils/authorization";

type BasisUserDetail = Omit<UserDetail, "image"> & { hasPicture: boolean };

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Users.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const userId = encodeURIComponent(getRouterParam(event, "userId") ?? "");
  const result = await basisApplicationsRequest<{ user: BasisUserDetail }>(
    auth,
    `/management/users/${userId}`,
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
