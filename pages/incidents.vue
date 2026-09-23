<script setup lang="ts">
import { WarningFilled } from "@element-plus/icons-vue"
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Incidents</h1>
      <p>Track and review workspace incidents.</p>
    </header>
    <el-card shadow="never">
      <template #header>Incident list</template>
      <el-empty :image-size="84" description="Incident details will appear here.">
        <el-icon :size="36" color="#c0c4cc"><WarningFilled /></el-icon>
      </el-empty>
    </el-card>
  </section>
</template>
