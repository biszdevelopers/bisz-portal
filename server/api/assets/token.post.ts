import { apiResult } from "~/server/utils/api-response";
import { requireSameOrigin } from "~/server/utils/basis-applications";
import { APIError } from "~/server/utils/basis-schema";
import { assetsAccessToken, portalAssetUser } from "~/server/utils/assets-auth";
import { basisPortalOrigin } from "~/server/utils/basis-auth";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store, private");
  setResponseHeader(event, "Pragma", "no-cache");
  setResponseHeader(event, "Vary", "Cookie");
  setResponseHeader(event, "X-Content-Type-Options", "nosniff");
  const origin = getHeader(event, "origin");
  const site = getHeader(event, "sec-fetch-site");
  if (origin !== basisPortalOrigin() || (site && site !== "same-origin"))
    return apiResult(event, new APIError("forbidden", "Same-origin request required", 403, "forbidden"));
  const originError = requireSameOrigin(event);
  if (originError) return apiResult(event, originError);

  const userId = await portalAssetUser(event);
  if (!userId) return apiResult(event, new APIError("invalid_session", "Portal sign-in required", 401, "invalid_session"));
  const token = await assetsAccessToken(event, getQuery(event).force === "1");
  if (token instanceof APIError) return apiResult(event, token);
  return { accessToken: token, userId };
});
