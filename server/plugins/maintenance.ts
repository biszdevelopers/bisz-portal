import { cleanupNotifications } from "~/server/services/notifications";
import { cleanupPushData } from "~/server/services/push";

export default defineNitroPlugin(() => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupNotifications();
      await cleanupPushData();
    } catch {
      // Cleanup is best effort and must never prevent the portal from serving.
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(() => void run(), 60_000);
  initial.unref?.();
  const timer = setInterval(() => void run(), 6 * 60 * 60_000);
  timer.unref?.();
});
