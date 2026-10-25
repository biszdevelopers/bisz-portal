import { databasePool } from "~/server/database/client";
import { APIError } from "~/server/utils/basis-schema";
import { portalAccessToken } from "~/server/utils/portal-auth-tokens";

export default defineNitroPlugin(() => {
  sessionHooks.hook("fetch", async (session, event) => {
    if (!session.user) return;
    const token = await portalAccessToken(event);
    if (token instanceof APIError && token.status === 401) {
      delete session.user;
      delete session.secure;
    }
  });
  sessionHooks.hook("clear", async (session) => {
    const sessionId = session.secure?.basisSessionId;
    if (typeof sessionId === "string")
      await databasePool().query("DELETE FROM portal_auth_tokens WHERE session_id = $1", [sessionId]).catch(() => {});
  });
});
