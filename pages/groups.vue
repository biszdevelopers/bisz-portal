<script setup lang="ts">
import { UserFilled } from "@element-plus/icons-vue"
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Groups</h1>
      <p>Organize people across the workspace.</p>
    </header>
    <el-card shadow="never">
      <template #header>Group directory</template>
      <el-empty :image-size="84" description="Group details will appear here.">
        <el-icon :size="36" color="#c0c4cc"><UserFilled /></el-icon>
      </el-empty>
    </el-card>
  </section>
</template>
