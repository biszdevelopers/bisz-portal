import { proxyResourceRequest } from "~/server/utils/resource-route";

export default defineEventHandler((event) => proxyResourceRequest(event, "delete", "DELETE"));
