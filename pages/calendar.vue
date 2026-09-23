<script setup lang="ts">
import { Calendar } from "@element-plus/icons-vue"
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Calendar</h1>
      <p>Review upcoming workspace activity.</p>
    </header>
    <el-card shadow="never">
      <template #header>Workspace calendar</template>
      <el-empty :image-size="84" description="Calendar activity will appear here.">
        <el-icon :size="36" color="#c0c4cc"><Calendar /></el-icon>
      </el-empty>
    </el-card>
  </section>
</template>
