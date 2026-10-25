import * as oidc from "openid-client";
import { randomUUID } from "node:crypto";
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestURL,
  getQuery,
  sendRedirect,
  setCookie,
} from "h3";

import {
  BASIS_PORTAL_AUTHORIZATION_SCOPES,
  basisAuthIssuer,
  basisPortalAudience,
} from "~/server/utils/basis-auth";
import { basisCallbackUrl, basisOidcConfiguration } from "~/server/utils/basis-oidc";
import { deletePortalTokens, savePortalTokens } from "~/server/utils/portal-auth-tokens";

const transactionCookieOptions = {
  httpOnly: true,
  maxAge: 10 * 60,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

const transactionCookieNames = {
  nonce: "basis_oidc_nonce",
  state: "basis_oidc_state",
  verifier: "basis_oidc_verifier",
};

function clearTransaction(event: Parameters<typeof getCookie>[0]) {
  for (const name of Object.values(transactionCookieNames)) {
    deleteCookie(event, name, transactionCookieOptions);
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  if (typeof query.code !== "string") {
    if (typeof query.error === "string") {
      throw createError({
        statusCode: 401,
        statusMessage: "DevConnect sign-in was declined",
      });
    }

    const configuration = await basisOidcConfiguration();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);

    setCookie(
      event,
      transactionCookieNames.state,
      state,
      transactionCookieOptions,
    );
    setCookie(
      event,
      transactionCookieNames.nonce,
      nonce,
      transactionCookieOptions,
    );
    setCookie(
      event,
      transactionCookieNames.verifier,
      verifier,
      transactionCookieOptions,
    );

    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      code_challenge: challenge,
      code_challenge_method: "S256",
      nonce,
      redirect_uri: basisCallbackUrl(),
      resource: basisPortalAudience(),
      response_type: "code",
      scope: BASIS_PORTAL_AUTHORIZATION_SCOPES.join(" "),
      state,
    });

    return sendRedirect(event, authorizationUrl.href);
  }

  const state = getCookie(event, transactionCookieNames.state);
  const nonce = getCookie(event, transactionCookieNames.nonce);
  const verifier = getCookie(event, transactionCookieNames.verifier);
  clearTransaction(event);

  if (!state || !nonce || !verifier) {
    throw createError({
      statusCode: 400,
      statusMessage: "DevConnect sign-in session expired",
    });
  }

  try {
    const configuration = await basisOidcConfiguration();
    const tokens = await oidc.authorizationCodeGrant(
      configuration,
      getRequestURL(event),
      {
        expectedNonce: nonce,
        expectedState: state,
        pkceCodeVerifier: verifier,
      },
    );
    const profile = tokens.claims();

    if (!profile?.sub || !tokens.refresh_token) {
      throw new Error(
        "DevConnect did not return an ID-token profile and offline access",
      );
    }

    const priorSessionId = (await getUserSession(event)).secure?.basisSessionId;
    const sessionId = randomUUID();
    await savePortalTokens(sessionId, profile.sub, tokens);
    try {
      await replaceUserSession(event, {
        secure: { basisSessionId: sessionId },
        user: {
          email: typeof profile.email === "string" ? profile.email : null,
          id: profile.sub,
          image:
            typeof profile.picture === "string"
              ? new URL(profile.picture, `${basisAuthIssuer()}/`).toString()
              : null,
          name: typeof profile.name === "string" ? profile.name : null,
        },
      });
    } catch (error) {
      await deletePortalTokens(sessionId);
      throw error;
    }
    if (priorSessionId) await deletePortalTokens(priorSessionId).catch(() => {});
  } catch {
    throw createError({
      statusCode: 401,
      statusMessage: "DevConnect sign-in failed",
    });
  }

  return sendRedirect(event, "/");
});
