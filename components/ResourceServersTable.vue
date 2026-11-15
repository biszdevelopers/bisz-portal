<script setup lang="ts">
import type { ResourceSummary } from "~/shared/contracts";

const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ resources: ResourceSummary[] }>(
  "/api/resources",
  { headers },
);

function resourcePath(resourceId: string) {
  return `/resources/${encodeURIComponent(resourceId)}`;
}
</script>

<template>
  <BackendErrorDetails v-if="error" :error="error" />
  <el-card v-else shadow="never" v-loading="pending">
    <el-table
      :data="data?.resources ?? []"
      empty-text="No resource servers are available to you"
      @row-click="(row: ResourceSummary) => navigateTo(resourcePath(row.resourceId))"
    >
      <el-table-column label="Resource server" min-width="240">
        <template #default="{ row }">
          <NuxtLink :to="resourcePath(row.resourceId)" @click.stop>{{ row.name }}</NuxtLink>
        </template>
      </el-table-column>
      <el-table-column label="Resource ID" min-width="360">
        <template #default="{ row }">
          <pre class="resource-id">{{ row.resourceId }}</pre>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
.resource-id {
  margin: 0;
  font: 12px/1.5 var(--el-font-family);
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
