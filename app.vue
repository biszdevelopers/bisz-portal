<template>
  <el-config-provider :locale="elementLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </el-config-provider>
</template>

<script setup lang="ts">
import elementLocale from "element-plus/es/locale/lang/en";

const requestEvent = useRequestEvent();
const nonce = import.meta.server
  ? (requestEvent?.context as Record<string, unknown> | undefined)?.cspNonce
  : undefined;

const themeInitScript = `(() => {
  try {
    const preference = localStorage.getItem("bisz-portal-theme")
    const isDark = preference === "dark" || (preference !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.classList.toggle("dark", isDark)
    document.documentElement.style.colorScheme = isDark ? "dark" : "light"
  } catch {}
})()`;

useHead({
  htmlAttrs: { lang: "en" },
  meta: [{ name: "color-scheme", content: "light dark" }],
  script: [
    {
      key: "theme-init",
      innerHTML: themeInitScript,
      tagPosition: "head",
      ...(typeof nonce === "string" ? { nonce } : {}),
    },
    ...(typeof nonce === "string"
      ? [
          {
            key: "csp-nonce",
            innerHTML: "void 0",
            tagPosition: "head" as const,
            nonce,
          },
        ]
      : []),
  ],
});

const { initializeTheme } = useTheme();
initializeTheme();

const { initialize: initializePwa } = usePwa();
onMounted(() => {
  void initializePwa();
});
</script>
