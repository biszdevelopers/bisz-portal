<script setup lang="ts">
import { Calendar } from "@element-plus/icons-vue"
const { capabilities, pending } = usePortalAccess()
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Calendar</h1>
      <p>Review upcoming workspace activity.</p>
    </header>
    <AccessDenied v-if="!pending && !capabilities.calendarRead" description="You need BiszPortal.Calendar.read to open the workspace calendar." />
    <el-card v-else shadow="never">
      <template #header>Workspace calendar</template>
      <el-empty :image-size="84" description="Calendar activity will appear here.">
        <el-icon :size="36" color="var(--el-text-color-placeholder)"><Calendar /></el-icon>
      </el-empty>
    </el-card>
  </section>
</template>
