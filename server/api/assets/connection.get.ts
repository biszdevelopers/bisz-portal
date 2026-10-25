import { APIError } from "~/server/utils/basis-schema";
import {
  assetsAccessToken,
  portalAssetUser,
  validateAssetsToken,
} from "~/server/utils/assets-auth";
import { assetsCapabilities } from "~/server/utils/authorization";
import { emptyAssetsCapabilities } from "~/shared/permissions";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "private, no-store");
  setResponseHeader(event, "Vary", "Cookie");

  const portalUser = await portalAssetUser(event);
  if (!portalUser) {
    return {
      portalSignedIn: false,
      connected: false,
      userId: null,
      capabilities: emptyAssetsCapabilities,
    };
  }
  const token = await assetsAccessToken(event);
  if (token instanceof APIError) {
    return {
      portalSignedIn: true,
      connected: false,
      userId: portalUser,
      capabilities: emptyAssetsCapabilities,
    };
  }

  try {
    const claims = await validateAssetsToken(token, portalUser);
    return {
      portalSignedIn: true,
      connected: true,
      userId: portalUser,
      capabilities: assetsCapabilities(claims.permissions),
    };
  } catch {
    return {
      portalSignedIn: true,
      connected: false,
      userId: portalUser,
      capabilities: emptyAssetsCapabilities,
    };
  }
});
