import { applicationDefaultPermissionsSchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { proxyApplicationMutation } from "~/server/utils/application-mutation";

export default defineEventHandler((event) =>
  proxyApplicationMutation(
    event,
    PortalPermissions.BiszPortal.ApplicationPermissions.manage,
    "/default-permissions",
    "PUT",
    applicationDefaultPermissionsSchema,
  ),
);
