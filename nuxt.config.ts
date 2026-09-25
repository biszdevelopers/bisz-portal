import { isAbsolute, relative } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = fileURLToPath(new URL(".", import.meta.url))

const portalOrigin = new URL(process.env.BASIS_PORTAL_ORIGIN ?? "http://localhost:4005")
const localHttpPortal = portalOrigin.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(portalOrigin.hostname)

const isCrossDrivePath = (path: unknown) => typeof path === "string" && isAbsolute(relative(rootDir, path))

export default defineNuxtConfig({
  compatibilityDate: "2026-09-21",
  srcDir: ".",
  modules: ["@element-plus/nuxt", "nuxt-auth-utils"],
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    session: {
      password: process.env.NUXT_SESSION_PASSWORD ?? "",
      maxAge: 9 * 60,
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
      const ignored = config.server?.watch?.ignored
      if (!Array.isArray(ignored)) return
      const patterns = ignored as unknown[]
      if (patterns.includes(isCrossDrivePath)) return
      patterns.unshift(isCrossDrivePath)
    },
  },
})
