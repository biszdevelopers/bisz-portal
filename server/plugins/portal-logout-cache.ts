import { logoutCacheSweepMs, sweepPortalLogoutCache } from "~/server/utils/portal-logout";

export default defineNitroPlugin((nitroApp) => {
  const interval = setInterval(() => {
    void sweepPortalLogoutCache().catch(() => console.warn("Could not clean the portal logout cache"));
  }, logoutCacheSweepMs);
  interval.unref();
  nitroApp.hooks.hook("close", () => clearInterval(interval));
});
