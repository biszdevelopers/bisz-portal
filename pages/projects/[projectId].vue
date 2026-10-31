<script setup lang="ts">
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
  Plus,
} from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import {
  localDateOnly,
  type ProjectDirectoryView,
  type ProjectAssetsLinkView,
  type ProjectSummary,
  type RepositoryValidationResult,
  type TaskView,
} from "~/shared/contracts";

type ProjectDetail = ProjectSummary & { tasks: TaskView[] };
type RepositoryUpdateResponse = RepositoryValidationResult & {
  project: ProjectDetail;
};

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const projectId = computed(() => String(route.params.projectId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ project: ProjectDetail }>(
  () => `/api/projects/${encodeURIComponent(projectId.value)}`,
  { headers },
);
const {
  data: assetsLinkData,
  pending: assetsLinkPending,
  error: assetsLinkError,
} = await useFetch<{ assets: ProjectAssetsLinkView }>(
  () => `/api/projects/${encodeURIComponent(projectId.value)}/assets`,
  { headers },
);
const project = computed(() => data.value?.project);
const requestError = shallowRef<unknown>(null);
const activeTab = ref("overview");
const saving = ref(false);
const savingGithub = ref(false);
const repairingAssetsLink = ref(false);
const taskDialogOpen = ref(false);
const creatingTask = ref(false);
const filesLoading = ref(false);
const filesLoaded = ref(false);
const filesError = shallowRef<unknown>(null);
const filesDirectory = ref<ProjectDirectoryView>({ path: "/", entries: [] });
const taskFormRef = ref<FormInstance>();
const form = reactive({ name: "", slug: "", description: "" });
const taskForm = reactive({ title: "", description: "", dueDate: null as string | null });

function validateTaskDueDate(
  _rule: unknown,
  value: string | null,
  callback: (error?: Error) => void,
) {
  if (value && value < localDateOnly()) {
    callback(new Error("Due date cannot be in the past"));
    return;
  }
  callback();
}

const taskRules: FormRules<typeof taskForm> = {
  title: [
    { required: true, whitespace: true, message: "Enter a task title", trigger: "blur" },
    { max: 120, message: "Use 120 characters or fewer", trigger: "blur" },
  ],
  dueDate: [{ validator: validateTaskDueDate, trigger: "change" }],
};
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
const canEditProjectSettings = computed(
  () =>
    Boolean(project.value?.capabilities.update) &&
    project.value?.status === "active",
);
const assetsLink = computed<ProjectAssetsLinkView>(() => {
  if (assetsLinkData.value?.assets) return assetsLinkData.value.assets;
  return {
    uid: project.value?.assetsProjectUid ?? null,
    manifestObjectId: project.value?.assetsManifestObjectId ?? null,
    status: assetsLinkError.value
      ? "unavailable"
      : project.value?.assetsProjectUid
        ? "unavailable"
        : "unlinked",
  };
});
const canRepairAssetsLink = computed(
  () =>
    canEditProjectSettings.value &&
    (assetsLink.value.status === "unlinked" ||
      assetsLink.value.status === "missing") &&
    !repairingAssetsLink.value,
);
const assetsStatusType = computed(() => {
  switch (assetsLink.value.status) {
    case "linked":
      return "success";
    case "missing":
      return "danger";
    case "unavailable":
      return "warning";
    default:
      return "info";
  }
});
const canCreateTask = computed(
  () =>
    Boolean(project.value?.capabilities.createTasks) &&
    project.value?.status === "active",
);

async function loadFilesDirectory(path: string) {
  if (filesLoading.value) return;
  filesLoading.value = true;
  try {
    const response = await $fetch<{ directory: ProjectDirectoryView }>(
      `/api/projects/${encodeURIComponent(projectId.value)}/files`,
      { query: { path } },
    );
    filesDirectory.value = response.directory;
    filesError.value = null;
    filesLoaded.value = true;
  } catch (caught) {
    filesError.value = caught;
  } finally {
    filesLoading.value = false;
  }
}

watch(activeTab, (tab) => {
  if (tab === "files" && !filesLoaded.value) void loadFilesDirectory("/");
});

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function disablePastDueDates(value: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return value.getTime() < today.getTime();
}

function openTaskDialog() {
  if (!canCreateTask.value) return;
  taskDialogOpen.value = true;
}

function resetTaskForm() {
  taskForm.title = "";
  taskForm.description = "";
  taskForm.dueDate = null;
  taskFormRef.value?.clearValidate();
}

async function createTask() {
  if (!project.value || !canCreateTask.value || creatingTask.value) return;
  const valid = await taskFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  creatingTask.value = true;
  try {
    const response = await $fetch<{ task: TaskView }>(
      `/api/projects/${encodeURIComponent(projectId.value)}/tasks`,
      {
        method: "POST",
        body: {
          title: taskForm.title,
          description: taskForm.description,
          dueDate: taskForm.dueDate,
        },
      },
    );
    project.value.tasks.unshift(response.task);
    project.value.taskCount += 1;
    requestError.value = null;
    taskDialogOpen.value = false;
    ElMessage.success("Task created");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The task could not be created."));
  } finally {
    creatingTask.value = false;
  }
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

async function repairAssetsLink() {
  if (!canRepairAssetsLink.value) return;
  repairingAssetsLink.value = true;
  try {
    const response = await $fetch<{
      assets: ProjectAssetsLinkView;
      project: ProjectDetail;
    }>(
      `/api/projects/${encodeURIComponent(projectId.value)}/assets/repair`,
      { method: "POST" },
    );
    assetsLinkData.value = { assets: response.assets };
    data.value = { project: response.project };
    requestError.value = null;
    ElMessage.success("Assets storage link repaired");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(
      backendErrorMessage(caught, "The Assets storage link could not be repaired."),
    );
  } finally {
    repairingAssetsLink.value = false;
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
      <el-tab-pane label="Files" name="files">
        <div class="files-tab">
          <header class="files-tab__header">
            <div>
              <h2>Files</h2>
              <p>Browse this project's Assets virtual file system.</p>
            </div>
            
          </header>
          
          <BackendErrorDetails v-if="filesError" :error="filesError" />
          
          <el-card>
            <strong class="bold">About operations on file system</strong>
            <p>You can only see the directory of this project's virtural file system here. To edit files, you can connect via SSH.</p>
            <p>To connect to this project's virtual file system, do the following:</p>
            <p class="font-mono my-2" v-if="assetsLink.manifestObjectId">ssh {{ assetsLink.manifestObjectId }}@vfs.bisz.dev</p>
            <p>Or uploading and downloading something like this:</p>
            <p class="font-mono my-2" v-if="assetsLink.manifestObjectId">scp {{ assetsLink.manifestObjectId }}@vfs.bisz.dev:/path/to/file ./local/path</p>
            <p>You will be prompted to log in via DevConnect</p>
            <p>For more, see here <el-link href="https://bisz.dev/VFS" target="_blank" underline="never">about VFS SSH</el-link></p>
          </el-card>

          <br>
          <FileBrowser
            :path="filesDirectory.path"
            :entries="filesDirectory.entries"
            :loading="filesLoading"
            :root-label="project?.name ?? 'Files'"
            :object-base-url="runtimeConfig.public.assetsApiUrl"
            @navigate="loadFilesDirectory"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="Tasks" name="tasks">
        <div class="tasks-tab">
          <header class="tasks-tab__header">
            <div>
              <h2>Tasks</h2>
              <p>Work tracked for this project.</p>
            </div>
            <el-button
              v-if="canCreateTask"
              type="primary"
              :icon="Plus"
              @click="openTaskDialog"
            >
              Create task
            </el-button>
          </header>

          <AccessDenied
            v-if="!project?.capabilities.readTasks"
            description="You need task read access for this project to view its tasks."
          />
          <div v-else-if="project?.tasks.length" class="task-list">
            <TaskCard
              v-for="task in project.tasks"
              :key="task.id"
              :task="task"
            />
          </div>
          <el-empty
            v-else
            :image-size="84"
            description="No tasks have been created for this project."
          />
        </div>
      </el-tab-pane>
      <el-tab-pane
        label="Settings"
        name="settings"
      >
        <div class="settings-layout">
          <aside aria-label="Settings sections">

            <el-anchor :offset="24">
              <el-anchor-link href="#project-settings-assets" title="Assets storage" />
              <el-anchor-link
                v-if="canEditProjectSettings"
                href="#project-settings-general"
                title="General"
              />
              <el-anchor-link
                v-if="canEditProjectSettings"
                href="#project-settings-github"
                title="GitHub"
              />
            </el-anchor>

          </aside>

          <div class="settings-content">
            <section id="project-settings-assets" class="settings-section">
              <h2>Assets storage</h2>
              <p>
                This project uses Assets as web storage for essential files.
                Files and Assets project metadata are managed from the Assets
                page or its API.
              </p>
              <el-divider />

              <div v-loading="assetsLinkPending" class="assets-link-settings">
                <el-descriptions :column="1" border>
                  <el-descriptions-item label="Status">
                    <el-tag :type="assetsStatusType">
                      {{ assetsLink.status }}
                    </el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item label="Assets project UID">
                    <pre v-if="assetsLink.uid">{{ assetsLink.uid }}</pre>
                    <span v-else>Not allocated</span>
                  </el-descriptions-item>
                  <el-descriptions-item label="VFS root manifest object ID">
                    <pre v-if="assetsLink.manifestObjectId">{{ assetsLink.manifestObjectId }}</pre>
                    <span v-else>Not allocated</span>
                  </el-descriptions-item>
                </el-descriptions>

                <el-alert
                  v-if="assetsLink.status === 'missing'"
                  title="The linked Assets project no longer exists"
                  description="An editor can allocate a replacement Assets project. The old link will be replaced only after allocation succeeds."
                  type="warning"
                  :closable="false"
                  show-icon
                />
                <el-alert
                  v-else-if="assetsLink.status === 'unavailable'"
                  title="Assets link could not be verified"
                  description="Repair is disabled until the Assets service can confirm whether the linked project exists."
                  type="warning"
                  :closable="false"
                  show-icon
                />
                <el-alert
                  v-else-if="assetsLink.status === 'unlinked'"
                  title="No Assets project is linked"
                  description="This is expected for legacy portal projects. An editor can allocate an Assets project now."
                  type="info"
                  :closable="false"
                  show-icon
                />

                <div class="assets-link-actions">
                  <el-button
                    v-if="assetsLink.uid && assetsLink.status === 'linked'"
                    tag="a"
                    :href="`/assets?projectUid=${encodeURIComponent(assetsLink.uid)}`"
                  >
                    Open in Assets
                  </el-button>
                  <el-button
                    v-if="
                      canEditProjectSettings &&
                      (assetsLink.status === 'unlinked' ||
                        assetsLink.status === 'missing')
                    "
                    type="primary"
                    :disabled="!canRepairAssetsLink"
                    :loading="repairingAssetsLink"
                    @click="repairAssetsLink"
                  >
                    Repair Assets link
                  </el-button>
                </div>
              </div>
            </section>

            <section
              v-if="canEditProjectSettings"
              id="project-settings-general"
              class="settings-section"
            >
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

            <section
              v-if="canEditProjectSettings"
              id="project-settings-github"
              class="settings-section"
            >
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

    <el-dialog
      v-model="taskDialogOpen"
      class="task-dialog"
      title="Create task"
      width="min(920px, calc(100vw - 32px))"
      destroy-on-close
      :close-on-click-modal="!creatingTask"
      :close-on-press-escape="!creatingTask"
      :show-close="!creatingTask"
      @closed="resetTaskForm"
    >
      <el-form
        ref="taskFormRef"
        :model="taskForm"
        :rules="taskRules"
        label-position="top"
        @submit.prevent="createTask"
      >
        <el-form-item label="Project">
          <el-input :model-value="project?.name ?? ''" disabled />
        </el-form-item>
        <el-form-item label="Title" prop="title">
          <el-input
            v-model="taskForm.title"
            placeholder="Refactor the authentication module"
            maxlength="120"
            show-word-limit
            autofocus
          />
          <span class="text-(--el-text-color-secondary)">Good titles have subject and action well-defined. See <el-link underline="never" href="https://bisz.dev/TaskTitleNaming" target="_blank">task title naming convention</el-link>.</span>
        </el-form-item>
        <el-form-item label="Description" prop="description">
          <MarkdownEditor v-model="taskForm.description" :maxlength="50_000" />
        </el-form-item>
        <el-form-item label="Due date" prop="dueDate">
          <el-date-picker
            v-model="taskForm.dueDate"
            type="date"
            value-format="YYYY-MM-DD"
            :disabled-date="disablePastDueDates"
            placeholder="No due date"
            clearable
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button :disabled="creatingTask" @click="taskDialogOpen = false">
          Cancel
        </el-button>
        <el-button type="primary" :loading="creatingTask" @click="createTask">
          Create task
        </el-button>
      </template>
    </el-dialog>
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

.tasks-tab,
.files-tab {
  padding-top: 8px;
}

.tasks-tab__header,
.files-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.tasks-tab__header h2,
.tasks-tab__header p,
.files-tab__header h2,
.files-tab__header p {
  margin: 0;
}

.tasks-tab__header p,
.files-tab__header p {
  margin-top: 5px;
  color: var(--el-text-color-secondary);
}

.task-list {
  display: grid;
  gap: 8px;
}

:deep(.el-dialog .el-date-editor.el-input) {
  width: 100%;
}

:deep(.task-dialog) {
  display: flex;
  max-height: calc(100vh - 32px);
  flex-direction: column;
  margin-top: 16px;
  margin-bottom: 16px;
}

:deep(.task-dialog .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
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

.assets-link-settings {
  min-height: 120px;
}

.assets-link-settings .el-alert {
  margin-top: 16px;
}

.assets-link-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
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

  .tasks-tab__header {
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
