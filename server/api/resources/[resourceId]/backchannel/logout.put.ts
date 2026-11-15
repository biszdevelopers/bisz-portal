import { resourceLogoutUriSchema } from "~/shared/contracts";
import { proxyResourceRequest } from "~/server/utils/resource-route";

export default defineEventHandler((event) =>
  proxyResourceRequest(event, "update", "PUT", "/backchannel/logout", resourceLogoutUriSchema),
);
