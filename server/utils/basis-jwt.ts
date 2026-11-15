import { createRemoteJWKSet, jwtVerify } from "jose";
import { basisAuthIssuer, basisPortalAudience } from "~/server/utils/basis-auth";

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyPortalJwt(token: string, typ: string) {
  const issuer = basisAuthIssuer();
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/oauth/jwks`));
    jwksByIssuer.set(issuer, jwks);
  }

  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"], issuer, audience: basisPortalAudience(), typ,
    requiredClaims: ["exp"],
  });
  if (protectedHeader.typ !== typ) throw new Error("Unexpected portal JWT type");
  return payload;
}
