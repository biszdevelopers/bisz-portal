import { createHmac } from "node:crypto";
import { createError, defineEventHandler, getHeader, readRawBody, sendNoContent } from "h3";
import { z } from "zod";
import { requiredEnvironment } from "~/server/utils/basis-auth";
import { basisInternalFetch } from "~/server/utils/basis-internal";
import { verifyPortalJwt } from "~/server/utils/basis-jwt";
import { endPortalSessions, recordAccessTokenRevocation } from "~/server/utils/portal-logout";

const verificationValue = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const timestamp = z.int().min(0).max(253402300799);
const logoutClaims = z.object({
  sub: z.uuid(),
  iat: timestamp,
  jti: z.string().min(1),
  events: z.object({ "http://schemas.openid.net/event/backchannel-logout": z.object({}) }),
});
const revocationClaims = z.object({
  iat: timestamp,
  access_token_jti: z.string().min(1),
  valid_after: timestamp,
  access_token_expires_at: timestamp.nullable(),
});

async function readSignedClaims<T>(token: string | null, typ: string, schema: z.ZodType<T>) {
  if (!token) throw createError({ statusCode: 400, statusMessage: "Missing backchannel token" });
  try {
    return schema.parse(await verifyPortalJwt(token, typ));
  } catch {
    throw createError({ statusCode: 401, statusMessage: "Invalid backchannel token" });
  }
}

async function sendVerificationProof(nonce: string, challengeHash: string) {
  const response = await basisInternalFetch("/backchannel/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce, challenge_hash: challengeHash }),
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`Basis Auth rejected the proof (${response.status})`);
}

export default defineEventHandler(async (event) => {
  const [mediaType] = (getHeader(event, "content-type") ?? "").split(";", 1);
  const contentType = mediaType?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded")
    throw createError({ statusCode: 415, statusMessage: "Expected a form-encoded backchannel request" });

  const form = new URLSearchParams(await readRawBody(event));
  const action = form.get("action");

  if (action === "test") {
    const nonce = verificationValue.safeParse(form.get("nonce"));
    const challenge = verificationValue.safeParse(form.get("challenge"));
    if (!nonce.success || !challenge.success)
      throw createError({ statusCode: 400, statusMessage: "Invalid backchannel challenge" });
    const challengeHash = createHmac("sha256", requiredEnvironment("BASIS_AUTH_RESOURCE_SECRET"))
      .update(challenge.data, "utf8").digest("hex");

    sendNoContent(event, 202);
    event.waitUntil(sendVerificationProof(nonce.data, challengeHash).catch(() => {
      console.warn("Could not validate the portal backchannel URL with Basis Auth");
    }));
    return;
  }

  if (action === "revoke_access_token") {
    const claims = await readSignedClaims(form.get("revocation_token"), "at-revocation+jwt", revocationClaims);
    if (form.get("jti") !== claims.access_token_jti || form.get("valid_after") !== String(claims.valid_after))
      throw createError({ statusCode: 400, statusMessage: "Revocation form does not match the signed token" });
    await recordAccessTokenRevocation(claims.access_token_jti, claims.valid_after, claims.iat, claims.access_token_expires_at);
    return sendNoContent(event);
  }

  if (action !== null)
    throw createError({ statusCode: 400, statusMessage: "Unknown backchannel action" });
  const claims = await readSignedClaims(form.get("logout_token"), "logout+jwt", logoutClaims);
  await endPortalSessions(claims.sub, claims.iat);
  return sendNoContent(event);
});
