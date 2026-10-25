import * as oidc from "openid-client";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { H3Event } from "h3";
import { databasePool } from "~/server/database/client";
import { BASIS_PORTAL_SCOPE, basisAuthIssuer, basisPortalAudience, requiredEnvironment } from "~/server/utils/basis-auth";
import { basisOidcConfiguration } from "~/server/utils/basis-oidc";
import { APIError, accessTokenClaimsSchema, type AccessTokenClaims } from "~/server/utils/basis-schema";

type TokenPair = { access_token: string; refresh_token?: string };
const refreshWindowMs = 60_000;
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function issuerJwks(issuer: string) {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/oauth/jwks`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

function encryptionKey() {
  return createHash("sha256")
    .update("bisz-portal:portal-oauth-tokens:v1\0")
    .update(requiredEnvironment("NUXT_SESSION_PASSWORD"))
    .digest();
}

function seal(value: string, sessionId: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${sessionId}\0${userId}`));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function unseal(value: string, sessionId: string, userId: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid stored portal token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`${sessionId}\0${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function expectedClaims(payload: unknown, userId: string) {
  const claims = accessTokenClaimsSchema.parse(payload);
  if (claims.sub !== userId || claims.client_id !== requiredEnvironment("BASIS_AUTH_CLIENT_ID") ||
      !claims.scope.split(/\s+/).includes(BASIS_PORTAL_SCOPE))
    throw new Error("Portal token identity, client, or scope is invalid");
  return claims;
}

export async function validatePortalAccessToken(token: string, userId: string): Promise<AccessTokenClaims> {
  const issuer = basisAuthIssuer();
  const { payload } = await jwtVerify(token, issuerJwks(issuer), {
    algorithms: ["RS256"], issuer, audience: basisPortalAudience(), typ: "at+jwt",
  });
  return expectedClaims(payload, userId);
}

export async function savePortalTokens(sessionId: string, userId: string, tokens: TokenPair) {
  if (!tokens.refresh_token) throw new Error("DevConnect did not rotate the refresh token");
  const claims = await validatePortalAccessToken(tokens.access_token, userId);
  await databasePool().query(
    `INSERT INTO portal_auth_tokens (session_id, user_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id,
       access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at, updated_at = now()`,
    [sessionId, userId, seal(tokens.access_token, sessionId, userId),
      seal(tokens.refresh_token, sessionId, userId), new Date(claims.exp * 1000)],
  );
  await databasePool().query(
    "DELETE FROM portal_auth_tokens WHERE updated_at < now() - interval '31 days'",
  ).catch(() => {});
}

export async function deletePortalTokens(sessionId: string) {
  await databasePool().query("DELETE FROM portal_auth_tokens WHERE session_id = $1", [sessionId]);
}

async function migrateLegacySession(event: H3Event, session: Awaited<ReturnType<typeof getUserSession>>) {
  const userId = session.user?.id;
  const accessToken = session.secure?.basisAccessToken;
  const refreshToken = session.secure?.basisRefreshToken;
  if (typeof userId !== "string" || !accessToken || !refreshToken) return null;
  const sessionId = session.id;
  const claims = expectedClaims(decodeJwt(accessToken), userId);
  await databasePool().query(
    `INSERT INTO portal_auth_tokens (session_id, user_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, userId, seal(accessToken, sessionId, userId),
      seal(refreshToken, sessionId, userId), new Date(claims.exp * 1000)],
  );
  await replaceUserSession(event, {
    user: session.user,
    secure: { basisSessionId: sessionId },
  });
  return sessionId;
}

function isInvalidGrant(error: unknown) {
  return typeof error === "object" && error !== null &&
    "error" in error && error.error === "invalid_grant";
}

export async function portalAccessToken(event: H3Event): Promise<string | APIError> {
  const session = await getUserSession(event);
  const userId = session.user?.id;
  if (typeof userId !== "string")
    return new APIError("invalid_session", "An authenticated session is required", 401, "invalid_session");

  let sessionId = session.secure?.basisSessionId;
  if (!sessionId) {
    try { sessionId = await migrateLegacySession(event, session) ?? undefined; }
    catch {
      await clearUserSession(event);
      return new APIError("invalid_session", "The session is invalid", 401, "invalid_session");
    }
  }
  if (!sessionId) {
    await clearUserSession(event);
    return new APIError("invalid_session", "The session is invalid", 401, "invalid_session");
  }

  const client = await databasePool().connect().catch(() => null);
  if (!client)
    return new APIError("auth_unavailable", "Could not read the DevConnect session", 502, "auth_unavailable");
  let clearSession = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      user_id: string; access_token: string; refresh_token: string; expires_at: Date;
    }>("SELECT user_id, access_token, refresh_token, expires_at FROM portal_auth_tokens WHERE session_id = $1 FOR UPDATE", [sessionId]);
    const row = result.rows[0];
    if (!row || row.user_id !== userId) {
      await client.query("COMMIT");
      clearSession = true;
      return new APIError("invalid_session", "The session is invalid", 401, "invalid_session");
    }
    if (row.expires_at.getTime() > Date.now() + refreshWindowMs) {
      const token = unseal(row.access_token, sessionId, userId);
      await client.query("COMMIT");
      return token;
    }
    let refreshConsumed = false;
    try {
      const tokens = await oidc.refreshTokenGrant(
        await basisOidcConfiguration(), unseal(row.refresh_token, sessionId, userId),
      );
      refreshConsumed = true;
      if (!tokens.refresh_token) throw new Error("DevConnect did not rotate the refresh token");
      const claims = await validatePortalAccessToken(tokens.access_token, userId);
      await client.query(
        `UPDATE portal_auth_tokens SET access_token = $1, refresh_token = $2,
         expires_at = $3, updated_at = now() WHERE session_id = $4`,
        [seal(tokens.access_token, sessionId, userId), seal(tokens.refresh_token, sessionId, userId),
          new Date(claims.exp * 1000), sessionId],
      );
      await client.query("COMMIT");
      return tokens.access_token;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isInvalidGrant(error) || refreshConsumed) {
        clearSession = true;
        return new APIError("invalid_session", "DevConnect session expired; sign in again", 401, "invalid_session");
      }
      return new APIError("auth_unavailable", "Could not refresh the DevConnect session", 502, "auth_unavailable");
    }
  } catch {
    await client.query("ROLLBACK");
    return new APIError("auth_unavailable", "Could not read the DevConnect session", 502, "auth_unavailable");
  } finally {
    client.release();
    if (clearSession) {
      await deletePortalTokens(sessionId).catch(() => {});
      await clearUserSession(event).catch(() => {});
    }
  }
}
