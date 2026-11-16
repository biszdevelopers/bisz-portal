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
      class="desktop-table"
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

    <div class="mobile-card-list">
      <NuxtLink
        v-for="resource in data?.resources ?? []"
        :key="resource.resourceId"
        :to="resourcePath(resource.resourceId)"
        class="resource-card surface"
      >
        <strong>{{ resource.name }}</strong>
        <pre class="resource-id">{{ resource.resourceId }}</pre>
      </NuxtLink>
      <el-empty
        v-if="!pending && !(data?.resources ?? []).length"
        :image-size="72"
        description="No resource servers are available to you"
      />
    </div>
  </el-card>
</template>

<style scoped>
.resource-id {
  margin: 0;
  font: 12px/1.5 var(--el-font-family);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
:deep(.el-table__row) {
  cursor: pointer;
}

.resource-card {
  display: grid;
  gap: 4px;
  padding: 12px;
  color: var(--text-primary);
  text-decoration: none;
}

.resource-card strong {
  font-size: 14px;
}
</style>
