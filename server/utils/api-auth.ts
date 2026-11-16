import type { H3Event } from "h3";

import {
  APIError,
  type AccessTokenClaims,
} from "~/server/utils/basis-schema";
import {
  decodePortalAccessClaims,
  invalidPortalAccessToken,
  portalAccessToken,
} from "~/server/utils/portal-auth-tokens";

export type AuthenticatedRequest = {
  accessToken: string;
  claims: AccessTokenClaims;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
};

export async function authenticateRequest(
  event: H3Event,
): Promise<AuthenticatedRequest | APIError> {
  const cached = event.context.portalAuthenticated as
    | AuthenticatedRequest
    | undefined;
  if (cached) return cached;

  try {
    const accessToken = await portalAccessToken(event);
    if (accessToken instanceof APIError) return accessToken;
    const session = await getUserSession(event);
    const userId = session.user?.id;
    if (typeof userId !== "string")
      return invalidPortalAccessToken();
    // portalAccessToken already loaded the sealed token and checked revocation.
    // Decoding avoids a second JWKS verification and revocation query per request.
    const claims = decodePortalAccessClaims(accessToken, userId);

    const result: AuthenticatedRequest = {
      accessToken,
      claims,
      user: {
        id: claims.sub,
        name: typeof session.user?.name === "string" ? session.user.name : null,
        image:
          typeof session.user?.image === "string" ? session.user.image : null,
      },
    };
    event.context.portalAuthenticated = result;
    return result;
  } catch {
    return invalidPortalAccessToken();
  }
}
