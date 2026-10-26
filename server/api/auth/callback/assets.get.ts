import * as oidc from "openid-client";
import { createError, deleteCookie, getCookie, getQuery, getRequestURL, sendRedirect, setCookie } from "h3";
import {
  assetsAudience,
  assetsCallbackUrl,
  AssetsIdentityMismatchError,
  assetsOidcConfiguration,
  assetsScope,
  portalAssetUser,
  requireMatchingAssetsUser,
  saveAssetsTokens,
} from "~/server/utils/assets-auth";
import { basisPortalOrigin } from "~/server/utils/basis-auth";

const cookieNames = {
  state: "assets_oidc_state",
  nonce: "assets_oidc_nonce",
  verifier: "assets_oidc_verifier",
};
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: new URL(basisPortalOrigin()).protocol === "https:",
  path: "/api/auth/callback/assets",
  maxAge: 600,
};

export default defineEventHandler(async (event) => {
  const userId = await portalAssetUser(event);
  if (!userId) throw createError({ statusCode: 401, statusMessage: "Portal sign-in required" });
  const query = getQuery(event);
  if (typeof query.error === "string") return sendRedirect(event, "/assets?auth=denied");

  if (typeof query.code !== "string") {
    const config = await assetsOidcConfiguration();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    setCookie(event, cookieNames.state, state, cookieOptions);
    setCookie(event, cookieNames.nonce, nonce, cookieOptions);
    setCookie(event, cookieNames.verifier, verifier, cookieOptions);
    const url = oidc.buildAuthorizationUrl(config, {
      response_type: "code",
      scope: `openid profile email offline_access ${assetsScope}`,
      resource: assetsAudience,
      redirect_uri: assetsCallbackUrl(),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });
    return sendRedirect(event, url.href);
  }

  const state = getCookie(event, cookieNames.state);
  const nonce = getCookie(event, cookieNames.nonce);
  const verifier = getCookie(event, cookieNames.verifier);
  for (const name of Object.values(cookieNames)) deleteCookie(event, name, cookieOptions);
  if (!state || !nonce || !verifier)
    throw createError({ statusCode: 400, statusMessage: "Assets sign-in session expired" });
  try {
    const tokens = await oidc.authorizationCodeGrant(
      await assetsOidcConfiguration(),
      getRequestURL(event),
      { expectedNonce: nonce, expectedState: state, pkceCodeVerifier: verifier },
    );
    requireMatchingAssetsUser(tokens.claims()?.sub, userId);
    await saveAssetsTokens(userId, tokens);
  } catch (error) {
    console.log(error)
    if (error instanceof AssetsIdentityMismatchError)
      return sendRedirect(event, "/assets?auth=mismatch");

    return sendRedirect(event, "/assets?auth=failed");
  }
  return sendRedirect(event, "/assets?auth=connected");
});
