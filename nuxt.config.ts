import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

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
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
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
    public: {
      assetsApiUrl:
        process.env.NUXT_PUBLIC_BISZ_ASSETS_API_URL ?? "http://localhost:5000",
    },
    session: {
      password: process.env.NUXT_SESSION_PASSWORD ?? "",
      maxAge: 30 * 24 * 60 * 60,
      cookie: {
        secure: !localHttpPortal,
      },
    },
  },
  typescript: {
    strict: true,
  },
  nitro: {
    errorHandler: "~/server/error.ts",
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
