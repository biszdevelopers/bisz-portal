import { proxyResourceRequest } from "~/server/utils/resource-route";

export default defineEventHandler((event) =>
  proxyResourceRequest(event, "update", "POST", "/secret/rotate"),
);
