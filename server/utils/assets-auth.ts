import * as oidc from "openid-client";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { H3Event } from "h3";
import { assetConnections } from "~/server/database/schema";
import { databasePool, useDatabase } from "~/server/database/client";
import { basisAuthIssuer, basisPortalOrigin } from "~/server/utils/basis-auth";
import {
  APIError,
  accessTokenClaimsSchema,
  type AccessTokenClaims,
} from "~/server/utils/basis-schema";

export const assetsAudience = process.env.BASIS_ASSETS_AUDIENCE ?? "https://assets.devconnect.org";
export const assetsScope = "assets.access";

export class AssetsIdentityMismatchError extends Error {
  constructor() {
    super("Assets sign-in user does not match portal user");
    this.name = "AssetsIdentityMismatchError";
  }
}

export function requireMatchingAssetsUser(subject: unknown, userId: string) {
  if (subject !== userId) throw new AssetsIdentityMismatchError();
}

export function assetsApiUrl() {
  return useRuntimeConfig().assetsApiUrl.replace(/\/$/, "");
}

export function assetsCallbackUrl() {
  return `${basisPortalOrigin()}/api/auth/callback/assets`;
}

function tokenKey() {
  const key = Buffer.from(useRuntimeConfig().assetsTokenKey, "base64");
  if (key.length !== 32) throw new Error("BASIS_ASSETS_TOKEN_KEY must encode 32 bytes");
  return key;
}

function seal(value: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${bytes.toString("base64url")}`;
}

function unseal(value: string, userId: string) {
  const [iv, tag, bytes] = value.split(".");
  if (!iv || !tag || !bytes) throw new Error("Invalid stored Assets token");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(bytes, "base64url")), decipher.final()]).toString("utf8");
}

export async function assetsOidcConfiguration() {
  const issuer = new URL(basisAuthIssuer());
  const config = useRuntimeConfig();
  if (!config.assetsClientSecret) throw new Error("BASIS_ASSETS_CLIENT_SECRET is required");
  return oidc.discovery(
    issuer,
    config.assetsClientId,
    { redirect_uris: [assetsCallbackUrl()] },
    oidc.ClientSecretBasic(config.assetsClientSecret),
    issuer.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(issuer.hostname)
      ? { execute: [oidc.allowInsecureRequests] }
      : undefined,
  );
}

export async function validateAssetsToken(
  token: string,
  userId: string,
): Promise<AccessTokenClaims> {
  const issuer = basisAuthIssuer();
  const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(`${issuer}/oauth/jwks`)), {
    algorithms: ["RS256"],
    issuer,
    audience: assetsAudience,
    typ: "at+jwt",
  });
  const claims = accessTokenClaimsSchema.parse(payload);
  requireMatchingAssetsUser(claims.sub, userId);
  if (claims.client_id !== useRuntimeConfig().assetsClientId ||
      !claims.scope.split(/\s+/).includes(assetsScope))
    throw new Error("Assets token client or scope is invalid");
  return claims;
}

export async function saveAssetsTokens(userId: string, tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}) {
  if (!tokens.refresh_token) throw new Error("Assets offline access was not granted");
  await validateAssetsToken(tokens.access_token, userId);
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 600) * 1000);
  await useDatabase().insert(assetConnections).values({
    userId,
    accessToken: seal(tokens.access_token, userId),
    refreshToken: seal(tokens.refresh_token, userId),
    expiresAt,
  }).onConflictDoUpdate({
    target: assetConnections.userId,
    set: {
      accessToken: seal(tokens.access_token, userId),
      refreshToken: seal(tokens.refresh_token, userId),
      expiresAt,
      updatedAt: new Date(),
    },
  });
}

export async function portalAssetUser(event: H3Event) {
  const session = await getUserSession(event);
  return typeof session.user?.id === "string" ? session.user.id : null;
}

export async function disconnectAssets(userId: string) {
  await databasePool().query("DELETE FROM asset_connections WHERE user_id = $1", [userId]);
}

export async function assetsAccessToken(event: H3Event, forceRefresh = false): Promise<string | APIError> {
  const userId = await portalAssetUser(event);
  if (!userId) return new APIError("invalid_session", "Sign in to the portal first", 401, "invalid_session");

  // Row locking serializes refresh-token rotation across concurrent portal requests.
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      access_token: string;
      refresh_token: string;
      expires_at: Date;
    }>("SELECT access_token, refresh_token, expires_at FROM asset_connections WHERE user_id = $1 FOR UPDATE", [userId]);
    const row = result.rows[0];
    if (!row) {
      await client.query("COMMIT");
      return new APIError("assets_connection_required", "Connect to DevConnect Assets first", 401, "assets_connection_required");
    }
    if (!forceRefresh && row.expires_at.getTime() > Date.now() + 60_000) {
      const token = unseal(row.access_token, userId);
      await client.query("COMMIT");
      return token;
    }
    try {
      const tokens = await oidc.refreshTokenGrant(await assetsOidcConfiguration(), unseal(row.refresh_token, userId));
      if (!tokens.refresh_token) throw new Error("Refresh token was not rotated");
      await validateAssetsToken(tokens.access_token, userId);
      await client.query(
        "UPDATE asset_connections SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = now() WHERE user_id = $4",
        [seal(tokens.access_token, userId), seal(tokens.refresh_token, userId), new Date(Date.now() + (tokens.expires_in ?? 600) * 1000), userId],
      );
      await client.query("COMMIT");
      return tokens.access_token;
    } catch {
      await client.query("DELETE FROM asset_connections WHERE user_id = $1", [userId]);
      await client.query("COMMIT");
      return new APIError("assets_connection_expired", "Connect to DevConnect Assets again", 401, "assets_connection_expired");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

