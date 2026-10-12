<script setup lang="ts">
import { WarningFilled } from "@element-plus/icons-vue";

const props = defineProps<{ error: unknown }>();
const details = computed(() =>
  normalizeBackendError(props.error, "The portal could not load this page."),
);

function recover() {
  clearError({ redirect: "/" });
}
</script>

<template>
  <NuxtLayout>
    <section class="error-page">
      <el-card class="error-card" shadow="never">
        <el-icon :size="44" color="var(--el-color-danger)"
          ><WarningFilled
        /></el-icon>
        <h1>Something went wrong</h1>
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
        <el-button type="primary" @click="recover">Back to overview</el-button>
      </el-card>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.error-page {
  display: grid;
  min-height: 70vh;
  place-items: center;
}

.error-card {
  max-width: 420px;
  text-align: center;
}

h1 {
  margin: 16px 0 8px;
  font-size: 20px;
}

.error-card :deep(.el-descriptions) {
  margin: 18px 0 24px;
  text-align: left;
}
</style>
