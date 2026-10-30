<script setup lang="ts">
const props = defineProps<{ source: string }>();

const html = ref("");
const error = ref("");
const pending = ref(false);
let renderVersion = 0;

watch(
  () => props.source,
  async (source) => {
    const version = ++renderVersion;
    html.value = "";
    error.value = "";
    if (!source.trim()) return;

    pending.value = true;
    try {
      const rendered = await renderMarkdown(source);
      if (version === renderVersion) html.value = rendered;
    } catch {
      if (version === renderVersion) {
        error.value = "The Markdown could not be rendered.";
      }
    } finally {
      if (version === renderVersion) pending.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-loading="pending" class="markdown-content">
    <el-alert
      v-if="error"
      title="Preview unavailable"
      :description="error"
      type="error"
      show-icon
      :closable="false"
    />
    <WrappedArticle v-else-if="html" :html="html" />
    <el-empty
      v-else
      :image-size="72"
      description="Nothing to preview yet."
    />
  </div>
</template>

<style scoped>
.markdown-content {
  min-height: 100%;
}
</style>
