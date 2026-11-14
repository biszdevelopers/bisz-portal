type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PushSubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const supported = ref(false);
const permission = ref<NotificationPermission>("default");
const subscribed = ref(false);
const updateReady = ref(false);
const installAvailable = ref(false);

let registration: ServiceWorkerRegistration | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;
let initialized = false;

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

async function refreshSubscriptionState() {
  if (!registration || !("PushManager" in window)) return;
  const existing = await registration.pushManager.getSubscription();
  subscribed.value = Boolean(existing);
}

export function usePwa() {
  const initialize = async () => {
    if (!import.meta.client || initialized) return;
    initialized = true;
    supported.value =
      "serviceWorker" in navigator &&
      "Notification" in window &&
      "PushManager" in window;
    permission.value =
      "Notification" in window ? Notification.permission : "denied";

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      installEvent = event as BeforeInstallPromptEvent;
      installAvailable.value = true;
    });
    window.addEventListener("appinstalled", () => {
      installAvailable.value = false;
      installEvent = null;
    });

    if (!("serviceWorker" in navigator)) return;
    registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    registration.addEventListener("updatefound", () => {
      const worker = registration?.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          updateReady.value = true;
        }
      });
    });
    await refreshSubscriptionState();
  };

  const applyUpdate = () => {
    window.location.reload();
  };

  const install = async () => {
    if (!installEvent) return false;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    installAvailable.value = false;
    installEvent = null;
    return choice.outcome === "accepted";
  };

  const enablePush = async (vapidPublicKey: string) => {
    if (!registration) await initialize();
    if (!registration) throw new Error("Notifications are not supported.");
    if (!vapidPublicKey) throw new Error("Push is not configured.");
    if (Notification.permission === "default") {
      permission.value = await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
    const payload = subscription.toJSON() as PushSubscriptionJson;
    await $fetch("/api/notifications/push/subscriptions", {
      method: "POST",
      body: payload,
    });
    subscribed.value = true;
  };

  const disablePush = async () => {
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscribed.value = false;
      return;
    }
    await $fetch("/api/notifications/push/subscriptions", {
      method: "DELETE",
      body: { endpoint: subscription.endpoint },
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
    subscribed.value = false;
  };

  return {
    supported,
    permission,
    subscribed,
    updateReady,
    installAvailable,
    initialize,
    refreshSubscriptionState,
    applyUpdate,
    install,
    enablePush,
    disablePush,
  };
}
