<script setup lang="ts">
import { Download, EditPen, MoreFilled, Search } from "@element-plus/icons-vue";
import type { UserPage } from "~/shared/contracts";
import { initials } from "~/utils/format";

const {
  capabilities,
  pending: accessPending,
  error: accessError,
} = usePortalAccess();
const page = ref(1);
const pageSize = 20;
const search = ref("");
const debouncedSearch = ref("");
const projectFilter = ref("");
const projects = ref<Array<{ id: string; name: string }>>([]);
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<UserPage>("/api/users", {
  headers,
  query: computed(() => ({
    page: page.value,
    pageSize,
    ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
    ...(projectFilter.value ? { projectId: projectFilter.value } : {}),
  })),
});
const users = computed(() => data.value?.users ?? []);
const total = computed(() => data.value?.pagination.total ?? 0);

async function loadProjects() {
  try {
    const response = await $fetch<{ projects: Array<{ id: string; name: string }> }>(
      "/api/projects",
    );
    projects.value = response.projects;
  } catch {
    projects.value = [];
  }
}

onMounted(loadProjects);
let timer: ReturnType<typeof setTimeout> | undefined;

function userInitials(user: Record<string, unknown>) {
  return initials(
    (typeof user.displayName === "string" && user.displayName.trim()) ||
      (typeof user.email === "string" ? user.email : "User"),
  );
}

function handleUserAction(command: string, userId: string) {
  if (command === "edit") navigateTo(`/users/${encodeURIComponent(userId)}`);
}

function openUser(user: { id: string }) {
  navigateTo(`/users/${encodeURIComponent(user.id)}`);
}

watch(search, (value) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    page.value = 1;
    debouncedSearch.value = value.trim();
  }, 300);
});

watch(debouncedSearch, () => {
  page.value = 1;
});

watch(projectFilter, () => {
  page.value = 1;
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

const exportUrl = computed(() => "/api/users/export.csv");

useHead({ title: "Users · DevConnect" });
</script>

<template>
  <section class="page users-page">
    <PageHeader title="Users" description="Browse users registered with Basis Auth.">
      <template #actions>
        <el-button v-if="capabilities.usersRead && capabilities.exportCsvCreate" tag="a" :href="exportUrl" :icon="Download">
          Export CSV
        </el-button>
      </template>
    </PageHeader>

    <BackendErrorDetails v-if="error || accessError" :error="error || accessError" />
    <AccessDenied
      v-else-if="!accessPending && !capabilities.usersRead"
      description="You need BiszPortal.Users.read to view users."
    />
    <el-card v-else shadow="never" v-loading="pending">
      <div class="users-toolbar">
        <el-input v-model="search" :prefix-icon="Search" clearable placeholder="Search by name or email" aria-label="Search users" />
        <el-select v-model="projectFilter" clearable placeholder="All projects" aria-label="Filter users by project">
          <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
        </el-select>
        <span class="muted">{{ total }} user{{ total === 1 ? "" : "s" }}</span>
      </div>

      <el-table class="desktop-table" :data="users" empty-text="No users found" @row-click="openUser">
        <el-table-column label="Profile" width="88">
          <template #default="{ row }">
            <el-avatar :size="36" :src="row.image || undefined">{{ userInitials(row) }}</el-avatar>
          </template>
        </el-table-column>
        <el-table-column label="Name" min-width="200">
          <template #default="{ row }">{{ row.displayName?.trim() || "Basis user" }}</template>
        </el-table-column>
        <el-table-column prop="email" label="Email" min-width="260" />
        <el-table-column label="User ID" min-width="320">
          <template #default="{ row }"><pre class="user-id">{{ row.id }}</pre></template>
        </el-table-column>
        <el-table-column width="64" align="right" fixed="right">
          <template #default="{ row }">
            <div @click.stop>
              <el-tooltip :content="capabilities.usersUpdate ? 'More actions' : 'Requires BiszPortal.Users.update'" placement="top">
                <span>
                  <el-button text circle :icon="MoreFilled" :disabled="!capabilities.usersUpdate" :aria-label="`More actions for ${row.displayName || row.email}`" />
                </span>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="mobile-card-list">
        <article v-for="user in users" :key="user.id" class="user-card surface" @click="openUser(user)">
          <el-avatar :size="38" :src="user.image || undefined">{{ userInitials(user) }}</el-avatar>
          <div>
            <strong>{{ user.displayName?.trim() || "Basis user" }}</strong>
            <small>{{ user.email }}</small>
          </div>
          <el-button v-if="capabilities.usersUpdate" text :icon="EditPen" aria-label="Edit user" @click.stop="openUser(user)" />
        </article>
      </div>

      <div class="pagination">
        <el-pagination
          v-model:current-page="page"
          background
          layout="prev, pager, next"
          :page-size="pageSize"
          :total="total"
        />
      </div>
    </el-card>
  </section>
</template>

<style scoped>
.users-page {
  display: grid;
  gap: 14px;
}

.users-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.users-toolbar .el-input {
  max-width: 360px;
}

.users-toolbar .el-select {
  width: 200px;
}

.user-id {
  margin: 0;
  overflow: hidden;
  font: 12px/1.5 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

.user-card div {
  display: grid;
  min-width: 0;
}

.user-card strong,
.user-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-card small {
  color: var(--text-muted);
  font-size: 12px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

@media (max-width: 767px) {
  .users-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .users-toolbar .el-input,
  .users-toolbar .el-select {
    width: 100%;
    max-width: none;
  }

  .pagination {
    justify-content: center;
  }
}
</style>
