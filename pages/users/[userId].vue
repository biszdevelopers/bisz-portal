<script setup lang="ts">
import { EditPen } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { UserDetail } from "~/shared/contracts";
import {
  buildUserPermissionTree,
  isEffectivelyGranted,
  isExplicitlyGranted,
  isInheritedAndLocked,
  selectedPermissionCount,
  togglePermissionRow,
  type UserPermissionTreeRow,
} from "~/utils/user-permission-tree";

const route = useRoute();
const userId = computed(() => String(route.params.userId ?? ""));
const { capabilities, data: accessData } = usePortalAccess();
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ user: UserDetail }>(
  () => `/api/users/${encodeURIComponent(userId.value)}`,
  { headers },
);
const user = computed(() => data.value?.user);
const requestError = shallowRef<unknown>(null);
const activeTab = ref("permissions");
const editDialog = ref(false);
const profileSaving = ref(false);
const permissionSaving = ref(false);
const form = reactive({ displayName: "", disabled: false });
const permissionGrants = ref<Record<string, string[]>>({});
const permissionTree = computed(() => buildUserPermissionTree(user.value?.applications ?? []));
const applicationsById = computed(() => new Map((user.value?.applications ?? []).map((application) => [application.applicationId, application])));
const editingSelf = computed(() => accessData.value?.user.id === user.value?.id);

const initials = computed(() => {
  const source = user.value?.displayName?.trim() || user.value?.email || "User";
  const words = source.split(/\s+/).filter(Boolean);
  return (
    words.length > 1
      ? `${words[0]?.[0]}${words.at(-1)?.[0]}`
      : source.slice(0, 2)
  ).toUpperCase();
});

function valueOrDash(value: string | null) {
  return value?.trim() || "—";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function openEdit() {
  if (!user.value || !capabilities.value.usersUpdate) return;
  restoreEditState();
  editDialog.value = true;
}

function restoreEditState() {
  if (!user.value) return;
  form.displayName = user.value.displayName ?? "";
  form.disabled = user.value.disabled;
}

function cancelEdit() {
  restoreEditState();
  editDialog.value = false;
}

function grantsFor(applicationId: string) {
  return permissionGrants.value[applicationId] ?? [];
}

function togglePermission(row: UserPermissionTreeRow) {
  if (!capabilities.value.usersUpdate || isInheritedAndLocked(row, grantsFor(row.applicationId))) return;
  permissionGrants.value = {
    ...permissionGrants.value,
    [row.applicationId]: togglePermissionRow(row, grantsFor(row.applicationId)),
  };
}

function resetPermissionGrants() {
  permissionGrants.value = Object.fromEntries(
    (user.value?.applications ?? []).map((application) => [application.applicationId, [...application.grants]]),
  );
}

function rowPermissionCount(row: UserPermissionTreeRow) {
  const application = applicationsById.value.get(row.applicationId);
  return application
    ? selectedPermissionCount(row, application, grantsFor(row.applicationId))
    : { selected: 0, total: 0 };
}

function permissionTreeRow(row: unknown) {
  return row as UserPermissionTreeRow;
}

function savedApplicationUpdates() {
  return (user.value?.applications ?? []).map((application) => ({
    applicationId: application.applicationId,
    catalogVersion: application.catalogVersion,
    grants: [...application.grants],
  }));
}

function selectedApplicationUpdates() {
  return (user.value?.applications ?? []).map((application) => ({
    applicationId: application.applicationId,
    catalogVersion: application.catalogVersion,
    grants: grantsFor(application.applicationId),
  }));
}

async function updateUser(
  displayName: string | null,
  disabled: boolean,
  applications: ReturnType<typeof savedApplicationUpdates>,
) {
  const response = await $fetch<{ user: UserDetail }>(
    `/api/users/${encodeURIComponent(userId.value)}`,
    {
      method: "PATCH",
      body: { displayName, disabled, applications },
    },
  );
  data.value = response;
  requestError.value = null;
  resetPermissionGrants();
}

async function saveProfile() {
  profileSaving.value = true;
  try {
    await updateUser(
      form.displayName.trim() || null,
      form.disabled,
      savedApplicationUpdates(),
    );
    editDialog.value = false;
    ElMessage.success("User updated");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The user could not be updated."));
  } finally {
    profileSaving.value = false;
  }
}

async function savePermissions() {
  if (!user.value) return;

  permissionSaving.value = true;
  try {
    await updateUser(
      user.value.displayName,
      user.value.disabled,
      selectedApplicationUpdates(),
    );
    ElMessage.success("Permissions updated");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The permissions could not be updated."));
  } finally {
    permissionSaving.value = false;
  }
}

watch(user, (current) => {
  if (current) resetPermissionGrants();
}, { immediate: true });
</script>

<template>
  <section v-loading="pending">
    <header class="page-header user-header">
      <div>
        <el-link :underline="false" href="/users">Users</el-link>
        <h1>{{ user?.displayName?.trim() || "Basis user" }}</h1>
        <pre v-if="user" class="user-id">{{ user.id }}</pre>
      </div>
      <el-tooltip
        :disabled="capabilities.usersUpdate"
        content="Requires BiszPortal.Users.update"
      >
        <span>
          <el-button
            :icon="EditPen"
            :disabled="!capabilities.usersUpdate"
            @click="openEdit"
          >
            Edit
          </el-button>
        </span>
      </el-tooltip>
    </header>

    <BackendErrorDetails
      v-if="error || requestError"
      :error="requestError || error"
    />
    <template v-if="user">
      <el-card shadow="never" class="details-card">
        <el-descriptions title="General information" :column="2" border>
        <el-descriptions-item label="Profile picture" :span="2">
          <div class="identity">
            <el-avatar :size="48" :src="user.image || undefined">
              {{ initials }}
            </el-avatar>
            <span>{{ user.displayName?.trim() || "Basis user" }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="Name">
          {{ user.displayName?.trim() || "Basis user" }}
        </el-descriptions-item>
        <el-descriptions-item label="User ID">
          <pre>{{ user.id }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Email">
          {{ user.email }}
        </el-descriptions-item>
        <el-descriptions-item label="Status">
          <el-tag :type="user.disabled ? 'danger' : 'success'">
            {{ user.disabled ? "Disabled" : "Active" }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Identity provider">
          {{ user.provider }}
        </el-descriptions-item>
        <el-descriptions-item label="Upstream issuer">
          <span class="breakable">{{ user.upstreamIssuer }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="Upstream subject">
          <pre>{{ user.upstreamSubject }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Email domain ID">
          <pre>{{ valueOrDash(user.emailSuffixId) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Student ID">
          {{ valueOrDash(user.studentId) }}
        </el-descriptions-item>
        <el-descriptions-item label="School district">
          {{ valueOrDash(user.schoolDistrict) }}
        </el-descriptions-item>
        <el-descriptions-item label="Created">
          {{ formatDate(user.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="Last updated">
          {{ formatDate(user.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="Tokens valid after" :span="2">
          {{ formatDate(user.tokensValidAfter) }}
        </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- <el-card shadow="never" class="configuration-card"> -->
        <el-tabs v-model="activeTab">
          <el-tab-pane label="Permissions" name="permissions">
            <div class="tab-toolbar">
              <div class="permission-actions">
                <el-button
                  :disabled="!capabilities.usersUpdate"
                  @click="resetPermissionGrants"
                >
                  Reset
                </el-button>
                <el-tooltip
                  :disabled="capabilities.usersUpdate"
                  content="Requires BiszPortal.Users.update"
                >
                  <span>
                    <el-button
                      type="primary"
                      :loading="permissionSaving"
                      :disabled="!capabilities.usersUpdate"
                      @click="savePermissions"
                    >
                      Save permissions
                    </el-button>
                  </span>
                </el-tooltip>
              </div>
            </div>
            <el-table
              :data="permissionTree"
              row-key="id"
              default-expand-all
              :tree-props="{ children: 'children' }"
              empty-text="No applications have been used by this user"
              class="permission-tree"
            >
              <el-table-column label="Application and permission" min-width="300">
                <template #default="{ row }">
                  <div class="permission-name">
                    <span :class="`permission-label permission-${row.kind}`">{{ row.label }}</span>
                    <el-tag
                      v-if="row.kind === 'namespace' || row.kind === 'application'"
                      size="small"
                      effect="plain"
                      class="permission-count"
                    >
                      {{ rowPermissionCount(permissionTreeRow(row)).selected }}/{{ rowPermissionCount(permissionTreeRow(row)).total }} permissions
                    </el-tag>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="Granted" width="300">
                <template #default="{ row }">
                  <div class="permission-grant-cell">
                    <el-tooltip
                      :disabled="capabilities.usersUpdate && !isInheritedAndLocked(permissionTreeRow(row), grantsFor(row.applicationId))"
                      :content="capabilities.usersUpdate ? 'This permission is included by a checked wildcard group. Uncheck that group to edit its children.' : 'Requires BiszPortal.Users.update'"
                      placement="top"
                    >
                      <span class="permission-checkbox-wrap">
                        <el-checkbox
                          :model-value="isEffectivelyGranted(permissionTreeRow(row), grantsFor(row.applicationId))"
                          :disabled="!capabilities.usersUpdate || isInheritedAndLocked(permissionTreeRow(row), grantsFor(row.applicationId)) || row.kind === 'application' && !row.rootPrefixes?.length"
                          :aria-label="`${row.label} permission grant`"
                          @change="togglePermission(permissionTreeRow(row))"
                        >
                          {{ row.kind === 'permission' ? 'Exact permission' : row.kind === 'application' ? 'All application groups' : 'All in this group' }}
                        </el-checkbox>
                      </span>
                    </el-tooltip>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="Description" min-width="240">
                <template #default="{ row }">
                  <span v-if="row.kind === 'permission'" class="permission-description">
                    {{ row.description }}
                  </span>
                  <span v-else class="field-help">
                    {{ row.kind === 'application' ? applicationsById.get(row.applicationId)?.name : `${row.prefix}.all` }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      <!-- </el-card> -->
    </template>

    <el-dialog
      v-model="editDialog"
      title="Edit user"
      width="min(560px, 96vw)"
    >
      <el-form label-position="top" @submit.prevent="saveProfile">
        <el-form-item label="Name">
          <el-input v-model="form.displayName" maxlength="200" />
        </el-form-item>
        <el-form-item label="Email">
          <el-input :model-value="user?.email" disabled />
        </el-form-item>
        <el-form-item>
          <el-checkbox
            v-model="form.disabled"
            :disabled="editingSelf && !user?.disabled"
          >
            Account disabled
          </el-checkbox>
          <div v-if="editingSelf && !user?.disabled" class="field-help">
            You cannot disable your own account.
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelEdit">Cancel</el-button>
        <el-button type="primary" :loading="profileSaving" @click="saveProfile">
          Save
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.user-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.user-header h1 {
  margin-top: 8px;
}

.user-id,
pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: 12px/1.5 var(--el-font-family);
}

.details-card {
  margin-bottom: 18px;
}

.identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.breakable {
  overflow-wrap: anywhere;
}

.field-help {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 8px;
}

.immutable-help {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
}

.permission-help {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin: 0 0 12px;
}

.permission-actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.permission-name,
.permission-grant-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.permission-name {
  display: inline-flex;
  flex-wrap: nowrap;
  max-width: calc(100% - 24px);
  vertical-align: middle;
}

.permission-grant-cell {
  flex-wrap: wrap;
}

.permission-checkbox-wrap {
  display: inline-flex;
}

.permission-application {
  font-weight: 650;
}

.permission-namespace {
  font-weight: 550;
}

.permission-count {
  flex: none;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.wildcard-warning {
  max-width: 100%;
  height: auto;
  white-space: normal;
  line-height: 1.35;
}

.permission-description {
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.permission-tree {
  width: 100%;
}

.configuration-card :deep(.el-card__body) {
  padding-top: 4px;
}

.configuration-card :deep(.el-table__cell) {
  vertical-align: top;
}

@media (max-width: 700px) {
  .details-card :deep(.el-descriptions__body) {
    overflow-x: auto;
  }

  .tab-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .permission-actions {
    align-self: flex-end;
  }

  .permission-grant-cell {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
}
</style>
