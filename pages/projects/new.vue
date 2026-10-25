<script setup lang="ts">
import { ElMessage } from "element-plus";
import type { ProjectSummary } from "~/shared/contracts";
import type { AssetsCapabilities } from "~/shared/permissions";

type ProjectResponse = { project: ProjectSummary };
type AssetsConnection = {
  connected: boolean;
  capabilities: AssetsCapabilities;
};

const {
  capabilities,
  pending: accessPending,
  error: accessError,
} = usePortalAccess();
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const {
  data: assetsConnection,
  pending: assetsPermissionsPending,
  error: assetsPermissionsError,
} = await useFetch<AssetsConnection>("/api/assets/connection", { headers });
const submitting = ref(false);
const requestError = shallowRef<unknown>(null);
const form = reactive({ name: "", slug: "", description: "" });

const requiredAssetPermissions = [
  { key: "assetsCreate", label: "Assets.Assets.create" },
  { key: "projectsCreate", label: "Assets.Projects.create" },
] as const;
const missingAssetPermissions = computed(() =>
  !assetsConnection.value?.connected
    ? []
    : requiredAssetPermissions
        .filter(({ key }) => !assetsConnection.value?.capabilities[key])
        .map(({ label }) => label),
);
const hasRequiredAssetPermissions = computed(
  () =>
    assetsConnection.value?.connected === true &&
    missingAssetPermissions.value.length === 0,
);
const assetPermissionsDescription = computed(() => {
  if (assetsPermissionsError.value)
    return "Could not verify your Assets permissions. Reload the page to try again.";
  if (!assetsConnection.value?.connected)
    return "Connect to DevConnect Assets to verify Assets.Assets.create and Assets.Projects.create.";
  return `Project creation requires Assets.Assets.create and Assets.Projects.create. Missing: ${missingAssetPermissions.value.join(", ")}`;
});

const slugPreview = computed(
  () =>
    form.slug ||
    form.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
);

function reportError(caught: unknown, fallback: string) {
  requestError.value = caught;
  ElMessage.error(backendErrorMessage(caught, fallback));
}

async function saveProject() {
  if (
    !capabilities.value.projectsCreate ||
    !hasRequiredAssetPermissions.value ||
    submitting.value
  )
    return;

  submitting.value = true;
  try {
    const response = await $fetch<ProjectResponse>("/api/projects", {
      method: "POST",
      body: { ...form, slug: form.slug || undefined },
    });
    requestError.value = null;
    ElMessage.success("Project created");
    await navigateTo(`/projects/${encodeURIComponent(response.project.id)}`);
  } catch (caught) {
    reportError(caught, "The project could not be saved.");
  } finally {
    submitting.value = false;
  }
}

function cancel() {
  return navigateTo("/projects");
}
</script>

<template>
  <section>
    <header class="page-header create-project-header">
      <div>
        <NuxtLink class="back-link" to="/projects">Projects</NuxtLink>
        <h1>Create a project</h1>
        <p>Set up a workspace for members, tasks, and incidents.</p>
      </div>
    </header>

    <BackendErrorDetails
      v-if="accessError || assetsPermissionsError"
      :error="accessError || assetsPermissionsError"
    />

    <div
      v-if="(accessPending || assetsPermissionsPending) && !accessError"
      class="create-project-loading"
    >
      <el-skeleton :rows="6" animated />
    </div>

    <AccessDenied
      v-else-if="!accessError && !capabilities.projectsCreate"
      title="Project creation unavailable"
      description="You need BiszPortal.Projects.create to create a project."
    />

    <div v-else-if="!accessError" class="create-project-form">
      <BackendErrorDetails v-if="requestError" :error="requestError" />

      <el-form label-position="top" @submit.prevent="saveProject">
        <el-form-item label="Project name">
          <el-input v-model="form.name" maxlength="120" show-word-limit />
        </el-form-item>

        <el-form-item label="Slug">
          <el-input
            v-model="form.slug"
            :placeholder="slugPreview || 'project-slug'"
          >
            <template #prepend>/projects/</template>
          </el-input>
        </el-form-item>

        <el-form-item label="README description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="13"
            placeholder="# Project overview&#10;&#10;Add goals, context, and working notes in Markdown."
          />
        </el-form-item>

        <div class="form-actions">
          <el-button @click="cancel">Cancel</el-button>
          <el-button
            type="primary"
            native-type="submit"
            :loading="submitting"
            :disabled="!hasRequiredAssetPermissions"
          >
            Create project
          </el-button>
        </div>

        <el-alert
          v-if="!hasRequiredAssetPermissions"
          class="permission-alert"
          title="Assets permissions required"
          :description="assetPermissionsDescription"
          type="warning"
          :closable="false"
          show-icon
        />
      </el-form>
    </div>
  </section>
</template>

<style scoped>
.create-project-header {
  margin-bottom: 20px;
}

.back-link {
  display: inline-block;
  margin-bottom: 7px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-decoration: none;
}

.back-link:hover {
  color: var(--el-color-primary);
}

.create-project-form,
.create-project-loading {
  max-width: 760px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.permission-alert {
  margin-top: 16px;
}

@media (max-width: 600px) {
  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .el-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
