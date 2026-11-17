import { closeDatabase } from "~/server/database/client";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("close", async () => {
    await closeDatabase().catch(() => undefined);
  });
});
