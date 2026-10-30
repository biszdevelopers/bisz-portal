<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: string;
    maxlength?: number;
  }>(),
  { maxlength: 50_000 },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const activeTab = ref("edit");
</script>

<template>
  <div class="markdown-editor">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="Edit" name="edit">
        <div class="markdown-editor__body">
          <el-input
            :model-value="props.modelValue"
            type="textarea"
            resize="none"
            :maxlength="props.maxlength"
            show-word-limit
            placeholder="Write a Markdown description…"
            @update:model-value="emit('update:modelValue', $event)"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="Preview" name="preview" lazy>
        <div class="markdown-editor__body markdown-editor__preview">
          <MarkdownContent :source="props.modelValue" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.markdown-editor {
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.markdown-editor :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background: var(--el-fill-color-light);
}

.markdown-editor :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.markdown-editor__body {
  height: 360px;
}

.markdown-editor__body :deep(.el-textarea),
.markdown-editor__body :deep(.el-textarea__inner) {
  height: 100%;
}

.markdown-editor__body :deep(.el-textarea__inner) {
  padding: 14px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  font-family: var(
    --el-font-family-monospace,
    ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace
  );
}

.markdown-editor__preview {
  overflow: auto;
  padding: 18px;
}
</style>
