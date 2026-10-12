<script setup lang="ts">
import { WarningFilled } from "@element-plus/icons-vue";
const { capabilities, pending, error } = usePortalAccess();
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Incidents</h1>
      <p>Track and review workspace incidents.</p>
    </header>
    <BackendErrorDetails v-if="error" :error="error" />
    <AccessDenied
      v-else-if="!pending && !capabilities.incidentsRead"
      description="You need BiszPortal.Incidents.read to open the incident workspace."
    />
    <el-card v-else shadow="never">
      <template #header>Incident list</template>
      <el-empty
        :image-size="84"
        description="Incident details will appear here."
      >
        <el-icon :size="36" color="var(--el-text-color-placeholder)"
          ><WarningFilled
        /></el-icon>
      </el-empty>
    </el-card>
  </section>
</template>
