const CACHE = "portal-shell-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((response) => response || Response.error()),
      ),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "DevConnect", body: event.data?.text() || "" };
  }
  const title = typeof payload.title === "string" ? payload.title : "DevConnect";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    data: {
      url:
        typeof payload.url === "string" && payload.url.startsWith("/")
          ? payload.url
          : "/",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          return client.navigate(target);
        }
      }
      return clients.openWindow(target);
    }),
  );
});

async function refreshSubscription() {
  const response = await fetch("/api/notifications/push/key", {
    credentials: "include",
  });
  if (!response.ok) return;
  const { enabled, publicKey } = await response.json();
  if (!enabled || !publicKey) return;
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
  const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const key = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) key[index] = raw.charCodeAt(index);
  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  await fetch("/api/notifications/push/subscriptions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(refreshSubscription().catch(() => undefined));
});
