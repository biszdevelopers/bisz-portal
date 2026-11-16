import type { PoolClient } from "pg";
import { databasePool, revocationWritePool } from "~/server/database/client";
import type { AccessTokenClaims } from "~/server/utils/basis-schema";

export const logoutCacheSweepMs = 60 * 60 * 1000;

export async function recordAccessTokenRevocation(
  jti: string, validAfter: number, issuedAt: number, expiresAt: number | null,
) {
  // The portal JWT verifier uses zero clock tolerance.
  const retainUntil = Math.max(issuedAt * 1000 + logoutCacheSweepMs, (expiresAt ?? 0) * 1000);
  await revocationWritePool().query(
    `INSERT INTO portal_revoked_access_tokens (jti, valid_after, retain_until) VALUES ($1, $2, $3)
     ON CONFLICT (jti) DO UPDATE SET
       valid_after = LEAST(portal_revoked_access_tokens.valid_after, EXCLUDED.valid_after),
       retain_until = GREATEST(portal_revoked_access_tokens.retain_until, EXCLUDED.retain_until)`,
    [jti, new Date(validAfter * 1000), new Date(retainUntil)],
  );
}

export async function endPortalSessions(userId: string, issuedAt: number) {
  // Keep a cutoff for legacy cookies and avoid deleting new sessions on retry.
  await databasePool().query(
    `WITH logout AS (
       INSERT INTO portal_user_logouts (user_id, issued_at) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET issued_at = EXCLUDED.issued_at
       WHERE portal_user_logouts.issued_at < EXCLUDED.issued_at
       RETURNING user_id
     )
     DELETE FROM portal_auth_tokens USING logout WHERE portal_auth_tokens.user_id = logout.user_id`,
    [userId, new Date(issuedAt * 1000)],
  );
}

export async function portalTokenStatus(
  claims: AccessTokenClaims, database: Pick<PoolClient, "query"> = databasePool(),
) {
  const { rows: [status] } = await database.query<{ revoked: boolean; logged_out: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM portal_revoked_access_tokens WHERE jti = $1 AND valid_after <= statement_timestamp()) AS revoked,
            EXISTS (SELECT 1 FROM portal_user_logouts WHERE user_id = $2 AND issued_at >= $3) AS logged_out`,
    [claims.jti, claims.sub, new Date(claims.iat * 1000)],
  );
  if (!status) throw new Error("Could not read portal token status");
  return status;
}

export async function sweepPortalLogoutCache() {
  await databasePool().query(`
    DELETE FROM portal_revoked_access_tokens WHERE retain_until <= now();
    DELETE FROM portal_user_logouts WHERE issued_at < now() - interval '31 days';
  `);
}
