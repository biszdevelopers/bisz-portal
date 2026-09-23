<script setup lang="ts">
import { DocumentChecked } from "@element-plus/icons-vue"
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Tasks</h1>
      <p>View and manage workspace tasks.</p>
    </header>
    <el-card shadow="never">
      <template #header>Task list</template>
      <el-empty :image-size="84" description="Your task workspace is ready.">
        <el-icon :size="36" color="#c0c4cc"><DocumentChecked /></el-icon>
      </el-empty>
    </el-card>
  </section>
</template>
