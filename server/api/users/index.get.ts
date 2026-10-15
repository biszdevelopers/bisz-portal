import type { UserPage } from "~/shared/contracts";
import { userListQuerySchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { apiResult } from "~/server/utils/api-response";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import { requirePortalPermission } from "~/server/utils/authorization";

type BasisUserPage = {
  users: Array<{
    id: string;
    displayName: string | null;
    email: string;
    hasPicture: boolean;
  }>;
  pagination: UserPage["pagination"];
};

export default defineEventHandler(async (event) => {
  const auth = await requirePortalPermission(
    event,
    PortalPermissions.BiszPortal.Users.read,
  );
  if (auth instanceof APIError) return apiResult(event, auth);

  const query = userListQuerySchema.safeParse(getQuery(event));
  if (!query.success) {
    return apiResult(
      event,
      new APIError(
        "invalid_request",
        query.error.issues[0]?.message ?? "Invalid pagination",
        400,
        "invalid_request",
      ),
    );
  }

  const search = new URLSearchParams({
    page: String(query.data.page),
    pageSize: String(query.data.pageSize),
  });
  const result = await basisApplicationsRequest<BasisUserPage>(
    auth,
    `/users?${search}`,
  );
  if (result instanceof APIError) return apiResult(event, result);

  const issuer = process.env.BASIS_AUTH_ISSUER?.replace(/\/$/, "");
  return apiResult(
    event,
    new APIResponse<UserPage>({
      users: result.users.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        image:
          user.hasPicture && issuer
            ? `${issuer}/api/picture/${encodeURIComponent(user.id)}`
            : null,
      })),
      pagination: result.pagination,
    }),
  );
});
