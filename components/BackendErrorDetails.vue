<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    error: unknown;
    fallbackDescription?: string;
  }>(),
  {
    fallbackDescription: "The request could not be completed.",
  },
);

const details = computed(() =>
  normalizeBackendError(props.error, props.fallbackDescription),
);
</script>

<template>
  <el-alert
    class="backend-error"
    title="Backend request failed"
    type="error"
    :closable="false"
    show-icon
  >
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="error">{{
        details.error
      }}</el-descriptions-item>
      <el-descriptions-item label="error_description">{{
        details.error_description
      }}</el-descriptions-item>
      <el-descriptions-item label="status">{{
        details.status
      }}</el-descriptions-item>
      <el-descriptions-item label="code">{{
        details.code
      }}</el-descriptions-item>
    </el-descriptions>
  </el-alert>
</template>

<style scoped>
.backend-error {
  margin-bottom: 18px;
}
.backend-error :deep(.el-alert__content) {
  min-width: 0;
  width: 100%;
}
.backend-error :deep(.el-alert__description) {
  margin-top: 12px;
}
.backend-error :deep(.el-descriptions__body) {
  background: transparent;
}
</style>
