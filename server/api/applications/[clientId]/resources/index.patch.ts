import { applicationResourceSchema } from "~/shared/contracts"
import { PortalPermissions } from "~/shared/permissions"
import { proxyApplicationMutation } from "~/server/utils/application-mutation"
export default defineEventHandler((event) => proxyApplicationMutation(event, PortalPermissions.BiszPortal.ApplicationResources.manage, "/resources", "PATCH", applicationResourceSchema))
