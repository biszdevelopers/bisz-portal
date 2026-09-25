<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const themeInitScript = `(() => {
  try {
    const preference = localStorage.getItem("bisz-portal-theme")
    const isDark = preference === "dark" || (preference !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.classList.toggle("dark", isDark)
    document.documentElement.style.colorScheme = isDark ? "dark" : "light"
  } catch {}
})()`

useHead({
  meta: [{ name: "color-scheme", content: "light dark" }],
  script: [{ key: "theme-init", innerHTML: themeInitScript, tagPosition: "head" }],
})

const { initializeTheme } = useTheme()
initializeTheme()
</script>
