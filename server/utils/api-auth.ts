import type { H3Event } from "h3";

import {
  APIError,
  type AccessTokenClaims,
} from "~/server/utils/basis-schema";
import { portalAccessToken, validatePortalAccessToken } from "~/server/utils/portal-auth-tokens";

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
  try {
    const accessToken = await portalAccessToken(event);
    if (accessToken instanceof APIError) return accessToken;
    const session = await getUserSession(event);
    const userId = session.user?.id;
    if (typeof userId !== "string")
      return new APIError("invalid_session", "The session is invalid", 401, "invalid_session");
    const claims = await validatePortalAccessToken(accessToken, userId);

    return {
      accessToken,
      claims,
      user: {
        id: claims.sub,
        name: typeof session.user?.name === "string" ? session.user.name : null,
        image:
          typeof session.user?.image === "string" ? session.user.image : null,
      },
    };
  } catch {
    return new APIError(
      "invalid_session",
      "The session is invalid or expired",
      401,
      "invalid_session",
    );
  }
}
