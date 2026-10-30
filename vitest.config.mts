import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    environment: "nuxt",
    include: ["tests/**/*.nuxt.ts"],
    environmentOptions: {
      nuxt: {
        domEnvironment: "happy-dom",
        mock: { intersectionObserver: true },
      },
    },
  },
});
