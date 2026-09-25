<script setup lang="ts">
import { Lock } from "@element-plus/icons-vue"

defineProps<{ title?: string, description: string }>()
</script>

<template>
  <el-card class="access-denied" shadow="never">
    <el-icon :size="34"><Lock /></el-icon>
    <h2>{{ title || "Access unavailable" }}</h2>
    <p>{{ description }}</p>
  </el-card>
</template>

<style scoped>
.access-denied { text-align: center; }
.access-denied :deep(.el-card__body) { padding: 52px 24px; }
.access-denied .el-icon { color: #909399; }
.access-denied h2 { margin: 14px 0 6px; font-size: 17px; }
.access-denied p { max-width: 460px; margin: auto; color: #909399; font-size: 13px; line-height: 1.6; }
</style>
