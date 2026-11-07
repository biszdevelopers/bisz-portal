import type { UserPage } from "~/shared/contracts";
import { userListQuerySchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { apiResult } from "~/server/utils/api-response";
import { basisApplicationsRequest } from "~/server/utils/basis-applications";
import { APIError, APIResponse } from "~/server/utils/basis-schema";
import {
  requirePortalPermission,
  requireProjectCapability,
} from "~/server/utils/authorization";
import { eq } from "drizzle-orm";
import { useDatabase } from "~/server/database/client";
import { projectMembers } from "~/server/database/schema";

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
  if (query.data.projectId) {
    const access = await requireProjectCapability(auth, query.data.projectId, "read");
    if (access instanceof APIError) return apiResult(event, access);
  }

  const search = new URLSearchParams({
    page: String(query.data.q ? 1 : query.data.page),
    pageSize: String(query.data.q ? 100 : query.data.pageSize),
  });
  if (query.data.q) search.set("search", query.data.q);
  const result = await basisApplicationsRequest<BasisUserPage>(
    auth,
    `/users?${search}`,
  );
  if (result instanceof APIError) return apiResult(event, result);

  const issuer = process.env.BASIS_AUTH_ISSUER?.replace(/\/$/, "");
  let matchedUsers = result.users.filter((user) => {
    if (!query.data.q) return true;
    const needle = query.data.q.toLocaleLowerCase();
    return (
      user.displayName?.toLocaleLowerCase().includes(needle) ||
      user.email.toLocaleLowerCase().includes(needle)
    );
  });
  if (query.data.projectId) {
    const memberships = await useDatabase()
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, query.data.projectId));
    const allowed = new Set(memberships.map((membership) => membership.userId));
    matchedUsers = matchedUsers.filter((user) => allowed.has(user.id));
  }
  return apiResult(
    event,
    new APIResponse<UserPage>({
      users: matchedUsers
        .slice(0, query.data.pageSize)
        .map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        image:
          user.hasPicture && issuer
            ? `${issuer}/api/picture/${encodeURIComponent(user.id)}`
            : null,
        })),
      pagination: query.data.q
        ? {
            page: 1,
            pageSize: query.data.pageSize,
            total: matchedUsers.length,
            totalPages: 1,
          }
        : result.pagination,
    }),
  );
});
