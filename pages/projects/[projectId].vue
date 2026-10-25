<script setup lang="ts">
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type {
  ProjectSummary,
  RepositoryValidationResult,
  TaskView,
} from "~/shared/contracts";

type ProjectDetail = ProjectSummary & { tasks: TaskView[] };
type RepositoryUpdateResponse = RepositoryValidationResult & {
  project: ProjectDetail;
};

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ project: ProjectDetail }>(
  () => `/api/projects/${encodeURIComponent(projectId.value)}`,
  { headers },
);
const project = computed(() => data.value?.project);
const requestError = shallowRef<unknown>(null);
const activeTab = ref("overview");
const saving = ref(false);
const savingGithub = ref(false);
const form = reactive({ name: "", slug: "", description: "" });
const githubForm = reactive({
  repositoryUrl: project.value?.githubRepository ?? "",
  defaultBranch: "main",
  accessToken: "",
});
const repositoryValidation = reactive<{
  state: "idle" | "pending" | "success" | "error";
  message: string;
}>({ state: "idle", message: "" });
const repositoryValidationResult = shallowRef<RepositoryValidationResult>();
const overviewRepository = shallowRef<RepositoryValidationResult>();
const overviewRepositoryPending = ref(false);
const overviewRepositoryError = ref("");
let repositoryValidationTimer: ReturnType<typeof setTimeout> | undefined;
let repositoryValidationRequest: AbortController | undefined;

const canSaveGithub = computed(
  () =>
    Boolean(project.value?.capabilities.update) &&
    project.value?.status !== "archived" &&
    repositoryValidation.state === "success" &&
    Boolean(repositoryValidationResult.value) &&
    repositoryValidationResult.value?.repository.url !==
      project.value?.githubRepository &&
    !savingGithub.value,
);

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function openEdit() {
  if (!project.value?.capabilities.update || project.value.status === "archived")
    return;
  form.name = project.value.name;
  form.slug = project.value.slug;
  form.description = project.value.description;
  activeTab.value = "settings";
}

watch(
  project,
  (value) => {
    if (!value) return;
    form.name = value.name;
    form.slug = value.slug;
    form.description = value.description;
  },
  { immediate: true },
);

async function validateRepository(repositoryUrl: string) {
  const request = new AbortController();
  repositoryValidationRequest = request;
  repositoryValidation.state = "pending";
  repositoryValidation.message = "Repository check in progress...";

  try {
    const result = await $fetch<RepositoryValidationResult>(
      `/api/projects/${encodeURIComponent(projectId.value)}/repository/validate`,
      {
        method: "POST",
        body: { repositoryUrl },
        signal: request.signal,
      },
    );
    if (githubForm.repositoryUrl.trim() !== repositoryUrl) return;

    repositoryValidationResult.value = result;
    githubForm.defaultBranch = result.repository.defaultBranch;
    repositoryValidation.state = "success";
    repositoryValidation.message = `Verified ${result.repository.fullName}`;
  } catch (caught) {
    if (request.signal.aborted) return;
    repositoryValidationResult.value = undefined;
    repositoryValidation.state = "error";
    repositoryValidation.message = normalizeBackendError(
      caught,
      "The repository could not be checked.",
    ).error_description;
  } finally {
    if (repositoryValidationRequest === request) {
      repositoryValidationRequest = undefined;
    }
  }
}

watch(
  () => githubForm.repositoryUrl,
  (value) => {
    if (repositoryValidationTimer) clearTimeout(repositoryValidationTimer);
    repositoryValidationRequest?.abort();
    repositoryValidationRequest = undefined;
    repositoryValidationResult.value = undefined;
    repositoryValidation.state = "idle";
    repositoryValidation.message = "";

    const repositoryUrl = value.trim();
    if (!repositoryUrl) return;
    repositoryValidationTimer = setTimeout(() => {
      repositoryValidationTimer = undefined;
      void validateRepository(repositoryUrl);
    }, 500);
  },
);

onBeforeUnmount(() => {
  if (repositoryValidationTimer) clearTimeout(repositoryValidationTimer);
  repositoryValidationRequest?.abort();
});

function setOverviewRepository(result: RepositoryValidationResult) {
  overviewRepository.value = result;
}

async function loadOverviewRepository() {
  if (!project.value?.githubRepository) return;
  overviewRepositoryPending.value = true;
  overviewRepositoryError.value = "";
  try {
    const result = await $fetch<RepositoryValidationResult>(
      `/api/projects/${encodeURIComponent(projectId.value)}/repository`,
      { headers },
    );
    setOverviewRepository(result);
  } catch (caught) {
    overviewRepositoryError.value = normalizeBackendError(
      caught,
      "The repository README could not be loaded.",
    ).error_description;
  } finally {
    overviewRepositoryPending.value = false;
  }
}

await loadOverviewRepository();

async function saveGithubRepository() {
  if (!canSaveGithub.value) return;
  savingGithub.value = true;
  try {
    const response = await $fetch<RepositoryUpdateResponse>(
      `/api/projects/${encodeURIComponent(projectId.value)}/repository`,
      {
        method: "PUT",
        body: { repositoryUrl: githubForm.repositoryUrl },
      },
    );
    data.value = { project: response.project };
    repositoryValidationResult.value = response;
    repositoryValidation.state = "success";
    repositoryValidation.message = `Repository verified and saved`;
    overviewRepositoryError.value = "";
    setOverviewRepository(response);
    ElMessage.success("GitHub repository updated");
  } catch (caught) {
    repositoryValidation.state = "error";
    repositoryValidation.message = normalizeBackendError(
      caught,
      "The GitHub repository could not be saved.",
    ).error_description;
    ElMessage.error(repositoryValidation.message);
  } finally {
    savingGithub.value = false;
  }
}

async function saveProject() {
  if (!project.value) return;
  saving.value = true;
  try {
    const response = await $fetch<{ project: ProjectDetail }>(
      `/api/projects/${encodeURIComponent(projectId.value)}`,
      { method: "PATCH", body: form },
    );
    data.value = response;
    requestError.value = null;
    ElMessage.success("Project updated");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(
      backendErrorMessage(caught, "The project could not be updated."),
    );
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section v-loading="pending">
    <header class="page-header project-header">
      <div>
        <el-link :underline="false" href="/projects">Projects</el-link>
        <h1>{{ project?.name ?? "Project" }}</h1>
        <pre v-if="project" class="project-id">{{ project.id }}</pre>
      </div>
      <el-button
        v-if="project?.githubRepository"
        tag="a"
        :href="project.githubRepository"
        target="_blank"
        rel="noopener noreferrer"
      >
        View on GitHub
      </el-button>
    </header>

    <BackendErrorDetails
      v-if="error || requestError"
      :error="requestError || error"
    />

    <el-card v-if="project" shadow="never" class="details-card">
      <el-descriptions title="Basic information" :column="2" border>
        <el-descriptions-item label="Name">
          {{ project.name }}
        </el-descriptions-item>
        <el-descriptions-item label="Status">
          <el-tag :type="project.status === 'active' ? 'success' : 'info'">
            {{ project.status === "active" ? "Active" : "Archived" }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Project ID">
          <pre>{{ project.id }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Slug">
          <pre>{{ project.slug }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Members">
          {{ project.memberCount }}
        </el-descriptions-item>
        <el-descriptions-item label="Tasks">
          {{ project.completedTaskCount }} of {{ project.taskCount }} completed
        </el-descriptions-item>
        <el-descriptions-item label="Created">
          {{ formatDate(project.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="Last updated">
          {{ formatDate(project.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="Description" :span="2">
          <div class="description">
            {{ project.description || "No project description yet." }}
          </div>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="Overview" name="overview">
        <div v-loading="overviewRepositoryPending" class="repository-overview">
          <el-alert
            v-if="overviewRepositoryError"
            title="GitHub repository unavailable"
            :description="overviewRepositoryError"
            type="error"
            show-icon
            :closable="false"
          />
          <el-empty
            v-else-if="!project?.githubRepository"
            description="No GitHub repository connected."
          />
          <template v-else-if="overviewRepository">

            <LinkedResourcePreview
              :link="overviewRepository.readme.url"
              :edit-link="overviewRepository.readme.editUrl"
              :content="overviewRepository.readme.content"
              file-type="markdown"
            />
          </template>
        </div>
      </el-tab-pane>
      <el-tab-pane
        label="Settings"
        name="settings"
        :disabled="
          !project?.capabilities.update || project.status === 'archived'
        "
      >
        <div class="settings-layout">
          <aside aria-label="Settings sections">

            <el-anchor :offset="24">
              <el-anchor-link href="#project-settings-general" title="General" />
              <el-anchor-link href="#project-settings-github" title="GitHub" />
            </el-anchor>

          </aside>

          <div class="settings-content">
            <section id="project-settings-general" class="settings-section">
              <h2>General</h2>
              <p>Update the project's name, URL slug, and description.</p>
              <el-divider />

              <el-form label-position="top" @submit.prevent="saveProject">
                <el-form-item label="Project name">
                  <el-input
                    v-model="form.name"
                    maxlength="120"
                    show-word-limit
                  />
                </el-form-item>
                <el-form-item label="Slug">
                  <el-input v-model="form.slug">
                    <template #prepend>/projects/</template>
                  </el-input>
                </el-form-item>
                <el-form-item label="README description">
                  <el-input
                    v-model="form.description"
                    type="textarea"
                    :rows="13"
                    maxlength="50000"
                  />
                </el-form-item>
                <el-button
                  type="primary"
                  :loading="saving"
                  @click="saveProject"
                >
                  Save
                </el-button>
              </el-form>
            </section>

            <section id="project-settings-github" class="settings-section">
              <h2>GitHub</h2>
              <p>Configure GitHub integration</p>
              <el-divider />

              <el-form label-position="top" @submit.prevent>
                <el-form-item label="Repository URL">
                  <el-input
                    v-model="githubForm.repositoryUrl"
                    placeholder="https://github.com/organization/repository"
                  >
                    <template #suffix>
                      <el-icon
                        v-if="repositoryValidation.state === 'pending'"
                        class="repository-status-icon is-loading"
                        aria-label="Repository check in progress"
                      >
                        <Loading />
                      </el-icon>
                      <el-icon
                        v-else-if="repositoryValidation.state === 'success'"
                        class="repository-status-icon is-success"
                        aria-label="Repository check succeeded"
                      >
                        <CircleCheckFilled />
                      </el-icon>
                      <el-icon
                        v-else-if="repositoryValidation.state === 'error'"
                        class="repository-status-icon is-error"
                        aria-label="Repository check failed"
                      >
                        <CircleCloseFilled />
                      </el-icon>
                    </template>
                  </el-input>
                  <p
                    v-if="repositoryValidation.message"
                    class="repository-validation-message"
                    :class="`is-${repositoryValidation.state}`"
                    aria-live="polite"
                  >
                    {{ repositoryValidation.message }}
                  </p>
                </el-form-item>
                <el-form-item label="Default branch">
                  <el-input
                    v-model="githubForm.defaultBranch"
                    placeholder="main"
                  />
                </el-form-item>
                <el-form-item label="Personal access token">
                  <el-input
                    v-model="githubForm.accessToken"
                    type="password"
                    placeholder="github_pat_..."
                    show-password
                  />
                </el-form-item>
                <el-button
                  type="primary"
                  :disabled="!canSaveGithub"
                  :loading="savingGithub"
                  @click="saveGithubRepository"
                >
                  Save GitHub settings
                </el-button>
              </el-form>
            </section>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<style scoped>
.project-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.project-header h1 {
  margin-top: 8px;
}

.project-id,
pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: 12px/1.5 var(--el-font-family);
}

.details-card {
  margin-bottom: 18px;
}

.description {
  white-space: pre-wrap;
}

.repository-overview {
  min-height: 180px;
  padding-top: 8px;
}

.repository-overview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.repository-overview-header h2,
.repository-overview-header p {
  margin: 0;
}

.repository-overview-header p {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
}

.settings-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 720px);
  gap: 40px;
  align-items: start;
  padding-top: 8px;
}

.settings-navigation {
  position: sticky;
  top: 24px;
}

.settings-content {
  min-width: 0;
}

.settings-section {
  scroll-margin-top: 24px;
}

.settings-section + .settings-section {
  margin-top: 56px;
}

.settings-section h2 {
  margin: 0;
}

.settings-section p {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
}

.settings-section :deep(.el-divider) {
  margin: 18px 0 24px;
}

.repository-status-icon.is-success,
.repository-validation-message.is-success {
  color: var(--el-color-success);
}

.repository-status-icon.is-error,
.repository-validation-message.is-error {
  color: var(--el-color-danger);
}

.repository-validation-message {
  width: 100%;
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.4;
}

@media (max-width: 700px) {
  .project-header {
    align-items: stretch;
    flex-direction: column;
  }

  .details-card :deep(.el-descriptions__body) {
    overflow-x: auto;
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .settings-navigation {
    position: static;
  }
}
</style>
