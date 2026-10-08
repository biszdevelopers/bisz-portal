import { applicationOwnerUpdateSchema } from "~/shared/contracts"
import { PortalPermissions } from "~/shared/permissions"
import { proxyApplicationMutation } from "~/server/utils/application-mutation"
export default defineEventHandler((event) => proxyApplicationMutation(event, PortalPermissions.BiszPortal.ApplicationOwners.manage, `/owners/${encodeURIComponent(getRouterParam(event, "userId") ?? "")}`, "PATCH", applicationOwnerUpdateSchema))
