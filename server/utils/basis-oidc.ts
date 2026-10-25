import * as oidc from "openid-client";
import { basisAuthIssuer, basisPortalOrigin, requiredEnvironment } from "~/server/utils/basis-auth";

export function basisCallbackUrl() {
  return `${basisPortalOrigin()}/api/auth/callback/basis-auth`;
}

export async function basisOidcConfiguration() {
  const issuer = new URL(basisAuthIssuer());
  return oidc.discovery(
    issuer,
    requiredEnvironment("BASIS_AUTH_CLIENT_ID"),
    { redirect_uris: [basisCallbackUrl()] },
    oidc.ClientSecretBasic(requiredEnvironment("BASIS_AUTH_CLIENT_SECRET")),
    issuer.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(issuer.hostname)
      ? { execute: [oidc.allowInsecureRequests] }
      : undefined,
  );
}
