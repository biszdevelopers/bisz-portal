import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const portalOrigin = new URL(
  process.env.BASIS_PORTAL_ORIGIN ?? "http://localhost:4005",
);
const localHttpPortal =
  portalOrigin.protocol === "http:" &&
  ["localhost", "127.0.0.1", "::1"].includes(portalOrigin.hostname);

const isCrossDrivePath = (path: unknown) =>
  typeof path === "string" && isAbsolute(relative(rootDir, path));

export default defineNuxtConfig({
  compatibilityDate: "2026-09-21",
  srcDir: ".",
  modules: ["@element-plus/nuxt", "nuxt-auth-utils"],
  css: ["~/assets/css/main.css"],
  app: {
    head: {
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [
        { name: "theme-color", content: "#f6f7f9" },
        { name: "format-detection", content: "telephone=no" },
      ],
      link: [
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
        {
          rel: "icon",
          href: "/icons/icon-192.png",
          type: "image/png",
          sizes: "192x192",
        },
        {
          rel: "preload",
          href: "/NotoSans-latin.woff2",
          as: "font",
          type: "font/woff2",
          crossorigin: "anonymous",
        },
      ],
    },
  },
  runtimeConfig: {
    appSecret:
      process.env.NUXT_APP_SECRET ??
      process.env.NUXT_SESSION_PASSWORD ??
      "",
    assetsClientId:
      process.env.BASIS_ASSETS_CLIENT_ID ??
      "66d015c8-1e3f-4a0d-b0f5-3bc3c6b72a86",
    assetsClientSecret: process.env.BASIS_ASSETS_CLIENT_SECRET ?? "",
    assetsTokenKey: process.env.BASIS_ASSETS_TOKEN_KEY ?? "",
    assetsApiUrl: process.env.BISZ_ASSETS_API_URL ?? "http://localhost:5000",
    githubAppId: process.env.GITHUB_APP_ID ?? "",
    githubAppPrivateKeyPath:
      process.env.GITHUB_APP_PRIVATE_KEY_PATH ?? "",
    githubDnsServers:
      process.env.GITHUB_DNS_SERVERS ?? "1.1.1.1,8.8.8.8",
    vapidPublicKey: process.env.NUXT_VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: process.env.NUXT_VAPID_PRIVATE_KEY ?? "",
    vapidSubject: process.env.NUXT_VAPID_SUBJECT ?? "",
    pushTokenKey: process.env.NUXT_PUSH_TOKEN_KEY ?? "",
    public: {
      assetsApiUrl:
        process.env.NUXT_PUBLIC_BISZ_ASSETS_API_URL ?? "http://localhost:5000",
      authIssuer: process.env.BASIS_AUTH_ISSUER ?? "",
      pushEnabled: process.env.NUXT_PUBLIC_PUSH_ENABLED === "true",
    },
    session: {
      maxAge: 30 * 24 * 60 * 60,
      cookie: {
        secure: !localHttpPortal,
      },
    },
  },
  typescript: {
    strict: true,
  },
  vue: {
    compilerOptions: {
      whitespace: "condense",
    },
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
  nitro: {
    errorHandler: "~/server/error.ts",
    compressPublicAssets: {
      gzip: true,
      brotli: true,
    },
  },
  routeRules: {
    "/_nuxt/**": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
    "/sw.js": {
      headers: { "cache-control": "no-cache" },
    },
    "/manifest.webmanifest": {
      headers: { "cache-control": "public, max-age=3600" },
    },
    "/icons/**": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
    "/NotoSans-latin.woff2": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
    "/NotoSans-latin-italic.woff2": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  },
  hooks: {
    "vite:extendConfig"(config) {
      const ignored = config.server?.watch?.ignored;
      if (!Array.isArray(ignored)) return;
      const patterns = ignored as unknown[];
      if (patterns.includes(isCrossDrivePath)) return;
      patterns.unshift(isCrossDrivePath);
    },
  },
});

