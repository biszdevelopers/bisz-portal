<script setup lang="ts">
import { Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { ApplicationDetail } from "~/shared/contracts";
import type {
  ApplicationOrganizationView,
  ApplicationSummary,
} from "~/shared/contracts";

const {
  capabilities,
  pending: accessPending,
  error: accessError,
} = usePortalAccess();
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{
  applications: ApplicationSummary[];
  organizations: ApplicationOrganizationView[];
}>("/api/applications", { headers });
const applications = computed(() => data.value?.applications ?? []);
const organizations = computed(() => data.value?.organizations ?? []);
const createDialog = ref(false);
const creating = ref(false);
const requestError = shallowRef<unknown>(null);
const createdClientId = ref("");
const createdSecret = ref("");
const secretDialog = ref(false);
const form = reactive({
  name: "",
  public: false,
  redirectUri: "",
  requireConsent: true,
  organizationIds: [] as string[],
});

function openApplication(row: ApplicationSummary) {
  navigateTo(`/applications/${encodeURIComponent(row.clientId)}`);
}

async function createApplication() {
  creating.value = true;
  try {
    const response = await $fetch<{
      application: ApplicationDetail;
      clientSecret?: string;
    }>("/api/applications", {
      method: "POST",
      body: {
        name: form.name,
        public: form.public,
        redirectUris: [form.redirectUri],
        requireConsent: form.requireConsent,
        filterMode: null,
        filterContent: [],
        organizationIds: form.organizationIds,
      },
    });
    requestError.value = null;
    createDialog.value = false;
    createdClientId.value = response.application.clientId;
    if (response.clientSecret) {
      createdSecret.value = response.clientSecret;
      secretDialog.value = true;
    } else {
      await navigateTo(
        `/applications/${encodeURIComponent(response.application.clientId)}`,
      );
    }
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(
      backendErrorMessage(caught, "The application could not be created."),
    );
  } finally {
    creating.value = false;
  }
}

async function closeSecret() {
  secretDialog.value = false;
  createdSecret.value = "";
  await navigateTo(
    `/applications/${encodeURIComponent(createdClientId.value)}`,
  );
}

</script>

<template>
  <section>
    <header class="page-header applications-header">
      <div>
        <h1>Applications</h1>
        <p>Manage the DevConnect registrations you belong to.</p>
      </div>
      <el-tooltip
        :disabled="capabilities.applicationsCreate"
        content="Requires BiszPortal.Applications.create"
      >
        <span
          ><el-button
            type="primary"
            :icon="Plus"
            :disabled="!capabilities.applicationsCreate"
            @click="createDialog = true"
            >New application</el-button
          ></span
        >
      </el-tooltip>
    </header>

    <BackendErrorDetails v-if="requestError" :error="requestError" />
    <BackendErrorDetails
      v-if="error || accessError"
      :error="error || accessError"
    />
    <AccessDenied
      v-else-if="!accessPending && !capabilities.applicationsRead"
      description="You need BiszPortal.Applications.read and application membership to view registrations."
    />
    <el-card v-else shadow="never" v-loading="pending">
      <el-table
        :data="applications"
        empty-text="No applications are assigned to you"
        @row-click="openApplication"
      >
        <el-table-column prop="name" label="Application" min-width="240" />
        <el-table-column label="Client ID" min-width="360">
          <template #default="{ row }">
            <pre class="client-id">{{ row.clientId }}</pre>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="createDialog"
      title="Create application"
      width="min(560px, 94vw)"
    >
      <el-form label-position="top" @submit.prevent="createApplication">
        <el-form-item label="Application name"
          ><el-input v-model="form.name"
        /></el-form-item>
        <el-form-item label="Initial redirect URI"
          ><el-input
            v-model="form.redirectUri"
            placeholder="https://example.com/callback"
        /></el-form-item>
        <el-form-item label="Organizations"
          ><el-checkbox-group v-model="form.organizationIds"
            ><el-checkbox
              v-for="organization in organizations"
              :key="organization.organizationId"
              :value="organization.organizationId"
              >{{ organization.organizationId
              }}{{
                organization.firstParty ? " (first party)" : ""
              }}</el-checkbox
            ></el-checkbox-group
          >
          <div v-if="!organizations.length" class="field-help">
            No organizations are available in Basis Auth.
          </div></el-form-item
        >
        <el-form-item
          ><el-checkbox v-model="form.public"
            >Public client (no client secret)</el-checkbox
          ></el-form-item
        >
        <el-form-item
          ><el-checkbox v-model="form.requireConsent"
            >Require user consent</el-checkbox
          ></el-form-item
        >
      </el-form>
      <template #footer
        ><el-button @click="createDialog = false">Cancel</el-button
        ><el-button
          type="primary"
          :loading="creating"
          @click="createApplication"
          >Create</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="secretDialog"
      title="Copy the client secret now"
      width="min(620px, 94vw)"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <el-alert
        title="This secret is shown only once. It cannot be recovered after this dialog closes."
        type="warning"
        :closable="false"
        show-icon
      />
      <el-input
        class="secret-value"
        :model-value="createdSecret"
        readonly
        type="textarea"
        :rows="3"
      />
      <template #footer
        ><CopyButton
          :value="createdSecret"
          label="Copy secret"
          success-message="Client secret copied"
        /><el-button type="primary" @click="closeSecret"
          >I have copied it</el-button
        ></template
      >
    </el-dialog>
  </section>
</template>

<style scoped>
.client-id {
  margin: 0;
  font: 12px/1.5 var(--el-font-family);
}
:deep(.el-table__row) {
  cursor: pointer;
}
.applications-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.secret-value {
  margin-top: 16px;
  font-family: monospace;
}
.field-help {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 6px;
}
</style>
