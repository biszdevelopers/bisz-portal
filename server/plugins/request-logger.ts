import { randomUUID } from "node:crypto";
import { setResponseHeader } from "h3";

const ignored = [
  "/_nuxt/",
  "/__nuxt",
  "/favicon",
  "/icons/",
  "/manifest.webmanifest",
  "/sw.js",
];

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    const id = getHeader(event, "x-request-id") || randomUUID();
    event.context.requestId = id;
    event.context.requestStartedAt = performance.now();
    setResponseHeader(event, "x-request-id", id);
  });

  nitroApp.hooks.hook("afterResponse", (event) => {
    const path = event.path.split("?")[0] ?? event.path;
    if (ignored.some((prefix) => path.startsWith(prefix))) return;
    const started = Number(event.context.requestStartedAt ?? performance.now());
    const status = event.node.res.statusCode;
    const entry = {
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      requestId: event.context.requestId,
      method: event.method,
      path,
      status,
      durationMs: Math.round(performance.now() - started),
    };
    const line = JSON.stringify(entry);
    if (status >= 500) console.error(line);
    else if (status >= 400) console.warn(line);
    else console.info(line);
  });
});
