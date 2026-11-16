<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import type { ResourceDetail } from "~/shared/contracts";
import { resourceScopeChangeSchema } from "~/shared/contracts";

definePageMeta({ key: (route) => route.path });

const route = useRoute();
const resourceId = String(route.params.resourceId);
const resourcePath = `/api/resources/${encodeURIComponent(resourceId)}`;
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ resource: ResourceDetail }>(
  resourcePath,
  { headers },
);
const resource = computed(() => data.value?.resource);
useHead(() => ({
  title: resource.value ? `${resource.value.name} · Resource Servers` : "Resource Server",
}));
const activeTab = useHashTab("scopes", ["scopes", "backchannel", "secret"]);
const scopeInput = ref("");
const logoutUri = ref(resource.value?.backchannelLogoutUri ?? "");
const resourceSecret = ref("");
const secretDialog = ref(false);
const saving = ref(false);
const requestError = shallowRef<unknown>(null);

watch(() => resource.value?.backchannelLogoutUri, (uri) => {
  logoutUri.value = uri ?? "";
});

async function saveChange(operation: () => Promise<void>, fallback: string) {
  if (saving.value) return;
  saving.value = true;
  requestError.value = null;
  try {
    await operation();
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, fallback));
  } finally {
    saving.value = false;
  }
}

async function changeScope(action: "add" | "remove", scope: string) {
  if (!resource.value?.capabilities.update) return;
  const parsed = resourceScopeChangeSchema.safeParse({ action, scope });
  if (!parsed.success) {
    ElMessage.error(parsed.error.issues[0]?.message ?? "Enter a valid scope.");
    return;
  }

  await saveChange(async () => {
    const response = await $fetch<{ resource: ResourceDetail }>(`${resourcePath}/scopes`, {
      method: "PATCH",
      body: parsed.data,
    });
    data.value = response;
    if (action === "add") scopeInput.value = "";
    ElMessage.success(action === "add" ? "Scope added" : "Scope removed");
  }, "The resource scopes could not be updated.");
}

async function saveLogoutUri() {
  if (!resource.value?.capabilities.update) return;
  const value = logoutUri.value.trim();
  await saveChange(async () => {
    const response = await $fetch<{ backchannelLogoutUri: string | null }>(
      `${resourcePath}/backchannel/logout`,
      value
        ? { method: "PUT", body: { backchannelLogoutUri: value } }
        : { method: "DELETE" },
    );
    if (resource.value) {
      data.value = { resource: { ...resource.value, ...response } };
    }
    logoutUri.value = response.backchannelLogoutUri ?? "";
    ElMessage.success(value ? "Logout webhook saved" : "Logout webhook cleared");
  }, "The logout webhook could not be updated.");
}

async function rotateSecret() {
  if (!resource.value?.capabilities.update || saving.value) return;
  try {
    await ElMessageBox.confirm(
      "Generate a new resource secret? The current secret will stop working immediately.",
      "Rotate resource secret",
      { type: "warning", confirmButtonText: "Rotate secret" },
    );
  } catch {
    return;
  }
  await saveChange(async () => {
    const response = await $fetch<{ resourceSecret: string }>(
      `${resourcePath}/secret/rotate`,
      { method: "POST" },
    );
    resourceSecret.value = response.resourceSecret;
    secretDialog.value = true;
  }, "The resource secret could not be rotated.");
}

function closeSecretDialog() {
  secretDialog.value = false;
  resourceSecret.value = "";
}

async function deleteResource() {
  if (!resource.value?.capabilities.delete) return;
  try {
    await ElMessageBox.confirm(
      `Delete ${resource.value.name} and its settings?`,
      "Delete resource",
      { type: "warning", confirmButtonText: "Delete resource" },
    );
  } catch {
    return;
  }
  await saveChange(async () => {
    await $fetch(resourcePath, { method: "DELETE" });
    ElMessage.success("Resource deleted");
    await navigateTo("/resources");
  }, "The resource could not be deleted.");
}
</script>

<template>
  <section class="page" v-loading="pending">
    <NuxtLink to="/resources">Back to Resource Servers</NuxtLink>
    <BackendErrorDetails v-if="error" :error="error" />
    <template v-else-if="resource">
      <header class="page-header resource-header">
        <div>
          <h1>{{ resource.name }}</h1>
          <p>{{ resource.resourceId }}</p>
        </div>
        <el-button v-if="resource.capabilities.delete" type="danger" plain :disabled="saving" @click="deleteResource">
          Delete resource
        </el-button>
      </header>
      <BackendErrorDetails v-if="requestError" :error="requestError" />
      <el-tabs v-model="activeTab">
        <el-tab-pane label="Scopes" name="scopes">
          <el-card shadow="never">
            <el-form v-if="resource?.capabilities?.update" label-position="top" @submit.prevent="changeScope('add', scopeInput)">
              <el-form-item label="New scope">
                <div class="scope-form">
                  <el-input v-model="scopeInput" :disabled="saving" />
                  <el-button native-type="submit" type="primary" :disabled="saving || !scopeInput.trim()">Add scope</el-button>
                </div>
              </el-form-item>
            </el-form>
            <div class="table-scroll">
              <el-table :data="resource.availableScopes.map((scope) => ({ scope }))" empty-text="No scopes configured">
                <el-table-column prop="scope" label="Scope" />
                <el-table-column v-if="resource?.capabilities?.update" label="Actions" width="120">
                  <template #default="{ row }">
                    <el-button text type="danger" :disabled="saving" @click="changeScope('remove', row.scope)">Remove</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-card>
        </el-tab-pane>
        <el-tab-pane label="Backchannel" name="backchannel">
          <el-card shadow="never">
            <el-form label-position="top" @submit.prevent="saveLogoutUri">
              <el-form-item label="Logout webhook URL">
                <el-input
                  v-model="logoutUri"
                  placeholder="https://example.com/logout"
                  :readonly="!resource?.capabilities?.update"
                  :disabled="saving"
                />
              </el-form-item>
              <el-button
                v-if="resource?.capabilities?.update"
                native-type="submit"
                type="primary"
                :disabled="saving || logoutUri.trim() === (resource?.backchannelLogoutUri ?? '')"
              >Save webhook</el-button>
            </el-form>
          </el-card>
        </el-tab-pane>
        <el-tab-pane label="Secret" name="secret">
          <el-card shadow="never">
            <el-button v-if="resource?.capabilities?.update" type="primary" :loading="saving" @click="rotateSecret">
              Rotate secret
            </el-button>
            <p v-else>Resource update access is required to rotate the secret.</p>
          </el-card>
        </el-tab-pane>
      </el-tabs>
      <el-dialog
        v-model="secretDialog"
        title="Copy the resource secret now"
        width="min(620px, 94vw)"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :show-close="false"
      >
        <el-alert
          title="This secret is shown only once. Copy it before closing this dialog."
          type="warning"
          :closable="false"
          show-icon
        />
        <el-input
          class="secret-value"
          :model-value="resourceSecret"
          readonly
          type="textarea"
          :rows="3"
        />
        <template #footer>
          <CopyButton :value="resourceSecret" label="Copy secret" success-message="Resource secret copied" />
          <el-button type="primary" @click="closeSecretDialog">I have copied it</el-button>
        </template>
      </el-dialog>
    </template>
  </section>
</template>

<style scoped>
.resource-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-top: 16px;
  overflow-wrap: anywhere;
}
.scope-form {
  display: flex;
  gap: 8px;
  max-width: 480px;
  width: 100%;
}
.secret-value {
  margin-top: 16px;
  font-family: monospace;
}

@media (max-width: 640px) {
  .resource-header {
    flex-direction: column;
  }

  .scope-form {
    flex-direction: column;
  }
}
</style>
