import { resourceScopeChangeSchema } from "~/shared/contracts";
import { proxyResourceRequest } from "~/server/utils/resource-route";

export default defineEventHandler((event) =>
  proxyResourceRequest(event, "update", "PATCH", "/scopes", resourceScopeChangeSchema),
);
