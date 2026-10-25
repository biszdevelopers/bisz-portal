<script setup lang="ts">
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

const props = defineProps<{
  link: string;
  editLink?: string;
  fileType: "markdown" | "iframe";
  content?: string;
}>();

const renderedHtml = ref("");
const previewError = ref("");

function safeHttpsUrl(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

const safeSourceUrl = computed(() => {
  const httpsUrl = safeHttpsUrl(props.link);
  if (httpsUrl) return httpsUrl;
  try {
    const url = new URL(props.link);
    return url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
      ? url.href
      : "";
  } catch {
    return "";
  }
});
const safeEditUrl = computed(() => safeHttpsUrl(props.editLink));
const iframeUrl = computed(() =>
  props.fileType === "iframe" ? safeSourceUrl.value : "",
);

const { data, pending, error } = await useAsyncData(
  async () => {
    if (props.fileType !== "markdown") return "";
    if (props.content !== undefined) return props.content;
    if (!safeSourceUrl.value) return "";
    return await $fetch<string>(safeSourceUrl.value, { responseType: "text" });
  },
  { watch: [() => props.link, () => props.fileType, () => props.content] },
);

watch(
  [data, error, () => props.fileType, safeSourceUrl],
  async ([content, fetchError]) => {
    previewError.value = fetchError
      ? "The linked file could not be loaded."
      : !safeSourceUrl.value
        ? "Only HTTPS resources can be previewed."
        : "";
    renderedHtml.value = "";
    if (props.fileType !== "markdown" || !content || fetchError) return;

    try {
      const rendered = await remark()
        .use(remarkGfm)
        .use(remarkHtml, { sanitize: true })
        .process(content);
      renderedHtml.value = String(rendered);
    } catch {
      previewError.value = "The linked file could not be rendered.";
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="linked-resource-preview">
    <header class="linked-resource-preview__header">
      <el-link
        class="linked-resource-preview__source"
        :href="safeSourceUrl || undefined"
        target="_blank"
        rel="noopener noreferrer"
        :underline="false"
      >
        {{ link }}
      </el-link>
      <el-link
        v-if="safeEditUrl"
        :href="safeEditUrl"
        target="_blank"
        rel="noopener noreferrer"
        type="primary"
        :underline="false"
      >
        Edit on GitHub
      </el-link>
    </header>

    <div v-loading="pending" class="linked-resource-preview__body">
      <el-alert
        v-if="previewError"
        title="Preview unavailable"
        :description="previewError"
        type="error"
        show-icon
        :closable="false"
      />
      <WrappedArticle
        v-else-if="fileType === 'markdown'"
        :html="renderedHtml"
      />
      <iframe
        v-else-if="iframeUrl"
        class="linked-resource-preview__iframe"
        :src="iframeUrl"
        title="Linked resource preview"
        sandbox=""
        referrerpolicy="no-referrer"
        allow=""
        loading="lazy"
      />
    </div>
  </section>
</template>

<style scoped>
.linked-resource-preview {
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}

.linked-resource-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 42px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.linked-resource-preview__source {
  min-width: 0;
  font-family: var(--el-font-family-monospace, monospace);
}

.linked-resource-preview__source :deep(.el-link__inner) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.linked-resource-preview__body {
  min-height: 180px;
  padding: 24px;
}

.linked-resource-preview__iframe {
  display: block;
  width: 100%;
  min-height: 560px;
  border: 0;
}

@media (max-width: 700px) {
  .linked-resource-preview__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .linked-resource-preview__source {
    max-width: 100%;
  }
}
</style>
