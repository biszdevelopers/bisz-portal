<script setup lang="ts">
defineProps<{
  html: string;
}>();
</script>

<template>
  <article class="wrapped-article" v-html="html" />
</template>

<style scoped>
.wrapped-article {
  overflow-wrap: anywhere;
  line-height: 1.65;
}

.wrapped-article :deep(h1),
.wrapped-article :deep(h2),
.wrapped-article :deep(h3) {
  padding-bottom: 8px;
  margin-top: 20px;
  margin-bottom: 12px;
  border-bottom: 2px solid var(--el-border-color-lighter);
  line-height: 1.25;
}

.wrapped-article :deep(h1) {
  font-size: 2em;
}

.wrapped-article :deep(h2) {
  font-size: 1.5em;
}

.wrapped-article :deep(h3) {
  font-size: 1.25em;
}

.wrapped-article :deep(hr) {
  height: 2px;
  margin: 24px 0;
  border: 0;
  background: var(--el-border-color-lighter);
}

.wrapped-article :deep(img) {
  max-width: 100%;
}

.wrapped-article :deep(pre) {
  overflow-x: auto;
  padding: 16px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.wrapped-article :deep(code) {
  font-family: var(--el-font-family);
}
</style>
