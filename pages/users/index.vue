<script setup lang="ts">
import { EditPen, MoreFilled } from "@element-plus/icons-vue";
import type { UserPage } from "~/shared/contracts";

const {
  capabilities,
  pending: accessPending,
  error: accessError,
} = usePortalAccess();
const page = ref(1);
const pageSize = 20;
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<UserPage>("/api/users", {
  headers,
  query: { page, pageSize },
});
const users = computed(() => data.value?.users ?? []);
const total = computed(() => data.value?.pagination.total ?? 0);

function userInitials(user: Record<string, unknown>) {
  const source =
    (typeof user.displayName === "string" && user.displayName.trim()) ||
    (typeof user.email === "string" ? user.email : "User");
  const words = source.split(/\s+/).filter(Boolean);
  return (
    words.length > 1
      ? `${words[0]?.[0]}${words.at(-1)?.[0]}`
      : source.slice(0, 2)
  ).toUpperCase();
}

function handleUserAction(command: string, userId: string) {
  if (command === "edit") {
    navigateTo(`/users/${encodeURIComponent(userId)}`);
  }
}

function openUser(user: { id: string }) {
  navigateTo(`/users/${encodeURIComponent(user.id)}`);
}
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Users</h1>
      <p>Browse users registered with Basis Auth.</p>
    </header>

    <BackendErrorDetails
      v-if="error || accessError"
      :error="error || accessError"
    />
    <AccessDenied
      v-else-if="!accessPending && !capabilities.usersRead"
      description="You need BiszPortal.Users.read to view users."
    />
    <el-card v-else shadow="never" v-loading="pending">
      <el-table
        :data="users"
        empty-text="No users found"
        @row-click="openUser"
      >
        <el-table-column label="Profile" width="88">
          <template #default="{ row }">
            <el-avatar :size="36" :src="row.image || undefined">
              {{ userInitials(row) }}
            </el-avatar>
          </template>
        </el-table-column>
        <el-table-column label="Name" min-width="200">
          <template #default="{ row }">
            {{ row.displayName?.trim() || "Basis user" }}
          </template>
        </el-table-column>
        <el-table-column prop="email" label="Email" min-width="260" />
        <el-table-column label="User ID" min-width="360">
          <template #default="{ row }">
            <pre class="user-id">{{ row.id }}</pre>
          </template>
        </el-table-column>
        <el-table-column width="64" align="right" fixed="right">
          <template #default="{ row }">
            <div @click.stop>
              <el-dropdown
                trigger="click"
                @command="(command: string) => handleUserAction(command, row.id)"
              >
                <el-tooltip content="More actions" placement="top">
                  <el-button
                    text
                    circle
                    :icon="MoreFilled"
                    :aria-label="`More actions for ${row.displayName || row.email}`"
                  />
                </el-tooltip>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit" :icon="EditPen">
                      Edit
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

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
.user-id {
  margin: 0;
  font: 12px/1.5 var(--el-font-family);
}

:deep(.el-table__row) {
  cursor: pointer;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
