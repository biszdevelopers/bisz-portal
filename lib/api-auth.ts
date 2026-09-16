import { createRemoteJWKSet, jwtVerify } from "jose"
import { getToken } from "next-auth/jwt"

import { APIError, accessTokenClaimsSchema, type AccessTokenClaims } from "@/lib/basis-schema"
import {
  BASIS_PORTAL_SCOPE,
  basisAuthIssuer,
  basisPortalAudience,
  requiredEnvironment,
} from "@/lib/basis-auth"

const issuer = basisAuthIssuer()
const audience = basisPortalAudience()
const jwks = createRemoteJWKSet(new URL(`${issuer}/oauth/jwks`))

type AuthenticatedRequest = {
  claims: AccessTokenClaims
  user: {
    id: string
    name: string | null
    email: string | null
    image: string | null
  }
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequest | APIError> {
  const cookie = request.headers.get("cookie") ?? ""
  const cookieName = cookie.includes("__Secure-authjs.session-token")
    ? "__Secure-authjs.session-token"
    : "authjs.session-token"

  if (!cookie.includes(`${cookieName}=`) && !cookie.includes(`${cookieName}.0=`)) {
    return new APIError("invalid_session", "An authenticated session is required", 401, "invalid_session")
  }

  try {
    const session = await getToken({
      req: request,
      secret: requiredEnvironment("AUTH_SECRET"),
      cookieName,
    })
    const accessToken = typeof session?.basisAccessToken === "string" ? session.basisAccessToken : null

    if (!accessToken) {
      return new APIError("invalid_session", "The session has no Basis access token", 401, "invalid_session")
    }

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
        name: typeof session?.name === "string" ? session.name : null,
        email: typeof session?.email === "string" ? session.email : null,
        image: typeof session?.picture === "string" ? session.picture : null,
      },
    }
  } catch {
    return new APIError("invalid_session", "The session is invalid or expired", 401, "invalid_session")
  }
}
