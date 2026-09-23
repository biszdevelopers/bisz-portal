import { createRemoteJWKSet, jwtVerify } from "jose"
import type { H3Event } from "h3"

import { APIError, accessTokenClaimsSchema, type AccessTokenClaims } from "~/server/utils/basis-schema"
import {
  BASIS_PORTAL_SCOPE,
  basisAuthIssuer,
  basisPortalAudience,
} from "~/server/utils/basis-auth"

type AuthenticatedRequest = {
  claims: AccessTokenClaims
  user: {
    id: string
    name: string | null
    email: string | null
    image: string | null
  }
}

export async function authenticateRequest(event: H3Event): Promise<AuthenticatedRequest | APIError> {
  try {
    const session = await getUserSession(event)
    const accessToken = typeof session.secure?.basisAccessToken === "string"
      ? session.secure.basisAccessToken
      : null

    if (!accessToken) {
      return new APIError("invalid_session", "An authenticated session is required", 401, "invalid_session")
    }

    const issuer = basisAuthIssuer()
    const audience = basisPortalAudience()
    const jwks = createRemoteJWKSet(new URL(`${issuer}/oauth/jwks`))

    const { payload } = await jwtVerify(accessToken, jwks, {
      algorithms: ["RS256"],
      issuer,
      audience,
      typ: "at+jwt",
    })
    const claims = accessTokenClaimsSchema.parse(payload)
    const scopes = new Set(claims.scope.split(/\s+/).filter(Boolean))

    if (!scopes.has(BASIS_PORTAL_SCOPE)) {
      return new APIError(
        "insufficient_scope",
        `The ${BASIS_PORTAL_SCOPE} scope is required`,
        403,
        "insufficient_scope",
      )
    }

    return {
      claims,
      user: {
        id: claims.sub,
        name: typeof session.user?.name === "string" ? session.user.name : null,
        email: typeof session.user?.email === "string" ? session.user.email : null,
        image: typeof session.user?.image === "string" ? session.user.image : null,
      },
    }
  } catch {
    return new APIError("invalid_session", "The session is invalid or expired", 401, "invalid_session")
  }
}
