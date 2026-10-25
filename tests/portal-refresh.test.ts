import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { databasePool } from "../server/database/client";
import { portalAccessToken, savePortalTokens } from "../server/utils/portal-auth-tokens";

const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.NUXT_SESSION_PASSWORD);

describe.skipIf(!hasDatabase)("portal token renewal", () => {
  const original = {
    issuer: process.env.BASIS_AUTH_ISSUER,
    audience: process.env.BASIS_AUTH_RESOURCE,
    clientId: process.env.BASIS_AUTH_CLIENT_ID,
    clientSecret: process.env.BASIS_AUTH_CLIENT_SECRET,
    getUserSession: (globalThis as Record<string, unknown>).getUserSession,
    replaceUserSession: (globalThis as Record<string, unknown>).replaceUserSession,
    clearUserSession: (globalThis as Record<string, unknown>).clearUserSession,
  };

  afterAll(() => {
    for (const [name, value] of [
      ["BASIS_AUTH_ISSUER", original.issuer],
      ["BASIS_AUTH_RESOURCE", original.audience],
      ["BASIS_AUTH_CLIENT_ID", original.clientId],
      ["BASIS_AUTH_CLIENT_SECRET", original.clientSecret],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    (globalThis as Record<string, unknown>).getUserSession = original.getUserSession;
    (globalThis as Record<string, unknown>).replaceUserSession = original.replaceUserSession;
    (globalThis as Record<string, unknown>).clearUserSession = original.clearUserSession;
  });

  test("encrypts tokens and refreshes a rotating token only once across concurrent requests", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "portal-refresh-test", use: "sig", alg: "RS256" };
    const userId = randomUUID();
    const sessionId = randomUUID();
    const legacySessionId = randomUUID();
    const audience = "devconnect://portal-refresh-test";
    const clientId = "portal-refresh-test";
    let refreshes = 0;
    let issuer = "";
    const issue = (seconds: number) => new SignJWT({
      client_id: clientId,
      scope: "openid offline_access noesis.access",
      permissions: ["BiszPortal.Projects.read"],
    }).setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: jwk.kid })
      .setIssuer(issuer).setAudience(audience).setSubject(userId)
      .setJti(randomUUID()).setIssuedAt().setExpirationTime(`${seconds}s`)
      .sign(privateKey);

    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/.well-known/openid-configuration")
          return Response.json({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/oauth/token`,
            jwks_uri: `${issuer}/oauth/jwks`,
          });
        if (url.pathname === "/oauth/jwks") return Response.json({ keys: [jwk] });
        if (url.pathname === "/oauth/token") {
          const body = await request.text();
          if (!body.includes("grant_type=refresh_token") || !body.includes("refresh_token=refresh-1"))
            return Response.json({ error: "invalid_grant" }, { status: 400 });
          refreshes++;
          return Response.json({
            access_token: await issue(600),
            refresh_token: "refresh-2",
            token_type: "Bearer",
            expires_in: 600,
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });
    issuer = `http://localhost:${server.port}`;
    process.env.BASIS_AUTH_ISSUER = issuer;
    process.env.BASIS_AUTH_RESOURCE = audience;
    process.env.BASIS_AUTH_CLIENT_ID = clientId;
    process.env.BASIS_AUTH_CLIENT_SECRET = "test-client-secret";
    let activeSession = {
      id: sessionId, user: { id: userId }, secure: { basisSessionId: sessionId },
    } as {
      id: string; user: { id: string };
      secure: { basisSessionId?: string; basisAccessToken?: string; basisRefreshToken?: string };
    };
    (globalThis as Record<string, unknown>).getUserSession = async () => activeSession;
    (globalThis as Record<string, unknown>).replaceUserSession = async (_event: unknown, data: {
      user: { id: string }; secure: { basisSessionId: string };
    }) => { activeSession = { id: legacySessionId, ...data }; };
    (globalThis as Record<string, unknown>).clearUserSession = async () => true;

    try {
      const firstToken = await issue(30);
      await savePortalTokens(sessionId, userId, {
        access_token: firstToken, refresh_token: "refresh-1",
      });
      const row = await databasePool().query<{ access_token: string; refresh_token: string }>(
        "SELECT access_token, refresh_token FROM portal_auth_tokens WHERE session_id = $1", [sessionId],
      );
      expect(row.rows[0]?.access_token).not.toBe(firstToken);
      expect(row.rows[0]?.refresh_token).not.toContain("refresh-1");

      const event = {} as Parameters<typeof portalAccessToken>[0];
      const [left, right] = await Promise.all([portalAccessToken(event), portalAccessToken(event)]);
      expect(typeof left).toBe("string");
      expect(left).toBe(right);
      expect(left).not.toBe(firstToken);
      expect(refreshes).toBe(1);
      expect(await portalAccessToken(event)).toBe(left);
      expect(refreshes).toBe(1);

      const legacyAccess = await issue(600);
      activeSession = {
        id: legacySessionId, user: { id: userId },
        secure: { basisAccessToken: legacyAccess, basisRefreshToken: "legacy-refresh" },
      };
      expect(await portalAccessToken(event)).toBe(legacyAccess);
      expect(activeSession.secure).toEqual({ basisSessionId: legacySessionId });
      expect(refreshes).toBe(1);
    } finally {
      await databasePool().query("DELETE FROM portal_auth_tokens WHERE session_id = ANY($1)", [[sessionId, legacySessionId]]);
      server.stop(true);
    }
  });
});
