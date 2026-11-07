<template>
  <el-config-provider :locale="elementLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </el-config-provider>
</template>

<script setup lang="ts">
import elementLocale from "element-plus/es/locale/lang/en";

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
    { key: "theme-init", innerHTML: themeInitScript, tagPosition: "head" },
  ],
});

const { initializeTheme } = useTheme();
initializeTheme();
</script>
