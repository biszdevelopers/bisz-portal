const portalOrigin = new URL(process.env.BASIS_PORTAL_ORIGIN ?? "http://localhost:4005")
const localHttpPortal = portalOrigin.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(portalOrigin.hostname)

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
  }
})
