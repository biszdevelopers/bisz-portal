import type { H3Event } from "h3";
import type { Permission } from "@basis/schema/permissions";
import { requirePortalPermission } from "~/server/utils/authorization";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError } from "~/server/utils/basis-schema";

export async function requireApplicationRequest(
  event: H3Event,
  permission: Permission,
  mutation = false,
) {
  const auth = await requirePortalPermission(event, permission);
  if (auth instanceof APIError) return auth;
  if (mutation) {
    const originError = requireSameOrigin(event);
    if (originError) return originError;
  }
  return auth;
}
