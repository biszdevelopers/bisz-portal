import { applicationSettingsSchema } from "~/shared/contracts";
import { PortalPermissions } from "~/shared/permissions";
import { proxyApplicationMutation } from "~/server/utils/application-mutation";

export default defineEventHandler((event) =>
  proxyApplicationMutation(
    event,
    PortalPermissions.BiszPortal.Applications.update,
    "",
    "PATCH",
    applicationSettingsSchema,
  ),
);
