<script setup lang="ts">
import { WarningFilled } from "@element-plus/icons-vue"

defineProps<{ error: Error }>()

function recover() {
  clearError({ redirect: "/" })
}
</script>

<template>
  <NuxtLayout>
    <section class="error-page">
      <el-card class="error-card" shadow="never">
        <el-icon :size="44" color="#f56c6c"><WarningFilled /></el-icon>
        <h1>Something went wrong</h1>
        <p>The portal could not load this page. Please try again.</p>
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

p {
  margin: 0 0 24px;
  color: #909399;
  font-size: 14px;
}
</style>
