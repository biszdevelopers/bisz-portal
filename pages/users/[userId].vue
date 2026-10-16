<script setup lang="ts">
import { EditPen } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { UserDetail } from "~/shared/contracts";

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
const editDialog = ref(false);
const saving = ref(false);
const form = reactive({ displayName: "", disabled: false });
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
  form.displayName = user.value.displayName ?? "";
  form.disabled = user.value.disabled;
  editDialog.value = true;
}

async function saveUser() {
  saving.value = true;
  try {
    const response = await $fetch<{ user: UserDetail }>(
      `/api/users/${encodeURIComponent(userId.value)}`,
      {
        method: "PATCH",
        body: {
          displayName: form.displayName.trim() || null,
          disabled: form.disabled,
        },
      },
    );
    data.value = response;
    requestError.value = null;
    editDialog.value = false;
    ElMessage.success("User updated");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The user could not be updated."));
  } finally {
    saving.value = false;
  }
}
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
    <el-card v-if="user" shadow="never" class="details-card">
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

    <el-dialog
      v-model="editDialog"
      title="Edit user"
      width="min(560px, 94vw)"
    >
      <el-form label-position="top" @submit.prevent="saveUser">
        <el-form-item label="Name">
          <el-input v-model="form.displayName" maxlength="200" />
        </el-form-item>
        <el-form-item label="Email">
          <el-input :model-value="user?.email" disabled />
          <div class="immutable-help">
            Email is an immutable account identifier.
          </div>
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
        <el-button @click="editDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveUser">
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

@media (max-width: 700px) {
  .details-card :deep(.el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
