<script setup lang="ts">
import type { ApplicationSummary } from "~/shared/contracts"

const { capabilities, pending: accessPending } = usePortalAccess()
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined
const { data, pending, error } = await useFetch<{ applications: ApplicationSummary[] }>("/api/applications", { headers })
const applications = computed(() => data.value?.applications ?? [])

function openApplication(row: ApplicationSummary) {
  navigateTo(`/applications/${encodeURIComponent(row.clientId)}`)
}
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Applications</h1>
      <p>Manage the DevConnect registrations you belong to.</p>
    </header>

    <AccessDenied
      v-if="!accessPending && (error || !capabilities.applicationsRead)"
      description="You need BiszPortal.Applications.read and application membership to view registrations."
    />
    <el-card v-else shadow="never" v-loading="pending">
      <el-table :data="applications" empty-text="No applications are assigned to you" @row-click="openApplication">
        <el-table-column prop="name" label="Application" min-width="240" />
        <el-table-column label="Client ID" min-width="360">
          <template #default="{ row }"><pre class="client-id">{{ row.clientId }}</pre></template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>

<style scoped>
.client-id { margin: 0; font: 12px/1.5 var(--el-font-family); }
:deep(.el-table__row) { cursor: pointer; }
</style>
