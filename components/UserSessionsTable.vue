<script setup lang="ts">
import { MoreFilled } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { UserAuthorizationSession } from "~/shared/contracts";

const props = defineProps<{ userId: string; canEnd: boolean }>();
const endpoint = computed(() => `/api/users/${encodeURIComponent(props.userId)}/sessions`);
const { data, error, pending, refresh } = useFetch<{ sessions: UserAuthorizationSession[] }>(endpoint, { server: false });
const ending = ref(false);
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" });

async function forceEnd(session: UserAuthorizationSession) {
  if (ending.value || !props.canEnd) return;
  ending.value = true;
  const path = `${endpoint.value}/${encodeURIComponent(session.id)}`;
  try {
    const confirmed = await ElMessageBox.confirm(
      `End this session for ${session.resource}?`,
      "Force end session",
      { type: "warning", confirmButtonText: "Force end session" },
    ).then(() => true, () => false);
    if (!confirmed) return;

    await $fetch(path, { method: "DELETE" });
    await refresh();
    if (!error.value) ElMessage.success("Session ended");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The session could not be ended."));
  } finally {
    ending.value = false;
  }
}
</script>

<template>
  <BackendErrorDetails v-if="error" :error="error" />
  <el-table v-else v-loading="pending" :data="data?.sessions ?? []" row-key="id" empty-text="No active sessions">
    <el-table-column label="Resource server" min-width="200">
      <template #default="{ row }">
        {{ row.resource }}
        <el-tag v-if="row.current" size="small" effect="plain">Current session</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="Created" min-width="220">
      <template #default="{ row }"><time :datetime="row.createdAt">{{ dateTime.format(new Date(row.createdAt)) }}</time></template>
    </el-table-column>
    <el-table-column label="Expires" min-width="220">
      <template #default="{ row }"><time :datetime="row.expiresAt">{{ dateTime.format(new Date(row.expiresAt)) }}</time></template>
    </el-table-column>
    <el-table-column v-if="canEnd" label="Actions" width="88" align="center">
      <template #default="{ row }">
        <el-dropdown trigger="click" :disabled="ending" @command="forceEnd(row as UserAuthorizationSession)">
          <el-button text :icon="MoreFilled" aria-label="Session actions" :disabled="ending" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="end">Force end session</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-table-column>
  </el-table>
</template>
