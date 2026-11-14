import { processPushQueue, pushConfigured } from "~/server/services/push";
import { sweepAllDueNotifications } from "~/server/services/notifications";

export default defineNitroPlugin(() => {
  if (!pushConfigured()) return;
  const timer = setInterval(() => {
    void sweepAllDueNotifications();
    void processPushQueue();
  }, 30_000);
  timer.unref?.();
});
