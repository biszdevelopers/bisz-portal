<script setup lang="ts">
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
  Plus,
  Setting,
} from "@element-plus/icons-vue";
import type {
  IncidentPage,
  IncidentView,
  ProjectAssetsLinkView,
  ProjectMemberView,
  ProjectSummary,
  RepositoryValidationResult,
  TaskTemplateView,
  TaskView,
  UserSummary,
} from "~/shared/contracts";

type ProjectDetail = ProjectSummary & { tasks: TaskView[] };
type RepositoryUpdateResponse = RepositoryValidationResult & {
  project: ProjectSummary;
};

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { capabilities } = usePortalAccess();
const [
  { data, pending, error, refresh: refreshProject },
  { data: assetsLinkData, pending: assetsLinkPending, error: assetsLinkError },
] = await Promise.all([
  useFetch<{ project: ProjectDetail }>(
    () => `/api/projects/${encodeURIComponent(projectId.value)}`,
    { headers },
  ),
  useFetch<{ assets: ProjectAssetsLinkView }>(
    () => `/api/projects/${encodeURIComponent(projectId.value)}/assets`,
    { headers },
  ),
]);
const project = computed(() => data.value?.project);
const requestError = shallowRef<unknown>(null);
const activeTab = useHashTab("overview", [
  "overview",
  "tasks",
  "incidents",
  "files",
  "members",
  "settings",
]);
const saving = ref(false);
const savingGithub = ref(false);
const repairingAssetsLink = ref(false);
const changingMembers = ref(false);
const archiving = ref(false);
const selectedMembers = ref<UserSummary[]>([]);
const permissionMember = ref<ProjectMemberView | null>(null);
const permissionDialog = ref(false);
const incidentDialog = ref(false);
const incidentPage = ref<IncidentPage>({ incidents: [], nextCursor: null });
const incidentsLoading = ref(false);
const incidentsError = shallowRef<unknown>(null);
const taskSearch = ref("");
const templateDialog = ref(false);
const templates = ref<TaskTemplateView[]>([]);
const templatesLoading = ref(false);
const activityFeed = ref<{ refresh: () => void }>();

const form = reactive({ name: "", slug: "", description: "" });
const githubForm = reactive({ repositoryUrl: "", defaultBranch: "main" });
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

const canEditProjectSettings = computed(
  () =>
    Boolean(project.value?.capabilities.update) &&
    project.value?.status === "active" &&
    !project.value?.reviewLocked,
);
const canCreateTask = computed(
  () =>
    Boolean(project.value?.capabilities.createTasks) &&
    project.value?.status === "active" &&
    !project.value?.reviewLocked,
);
const canManageMembers = computed(
  () =>
    Boolean(project.value?.capabilities.manageMembers) &&
    project.value?.status === "active" &&
    !project.value?.reviewLocked,
);
const canCreateIncident = computed(
  () =>
    capabilities.value.incidentsCreate &&
    Boolean(project.value?.capabilities.writeIncidents),
);
const canArchive = computed(
  () =>
    Boolean(project.value?.capabilities.archive) &&
    !project.value?.reviewLocked,
);
const assetsLink = computed<ProjectAssetsLinkView>(() => {
  if (assetsLinkData.value?.assets) return assetsLinkData.value.assets;
  return {
    uid: project.value?.assetsProjectUid ?? null,
    status: assetsLinkError.value
      ? "unavailable"
      : project.value?.assetsProjectUid
        ? "unavailable"
        : "unlinked",
  };
});
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
const canRepairAssetsLink = computed(
  () =>
    canEditProjectSettings.value &&
    (assetsLink.value.status === "unlinked" ||
      assetsLink.value.status === "missing") &&
    !repairingAssetsLink.value,
);
const existingMemberIds = computed(
  () => project.value?.members.map((member) => member.userId) ?? [],
);
const ownerIds = computed(
  () =>
    project.value?.members
      .filter((member) => member.role === "owner")
      .map((member) => member.userId) ?? [],
);
const filteredTasks = computed(() => {
  const needle = taskSearch.value.trim().toLocaleLowerCase();
  if (!needle) return project.value?.tasks ?? [];
  return (project.value?.tasks ?? []).filter(
    (task) =>
      task.title.toLocaleLowerCase().includes(needle) ||
      task.description.toLocaleLowerCase().includes(needle),
  );
});
const projectOptions = computed(() =>
  project.value ? [{ id: project.value.id, name: project.value.name }] : [],
);
const canSaveGithub = computed(
  () =>
    canEditProjectSettings.value &&
    repositoryValidation.state === "success" &&
    Boolean(repositoryValidationResult.value) &&
    repositoryValidationResult.value?.repository.url !==
      project.value?.githubRepository &&
    !savingGithub.value,
);

watch(
  project,
  (value) => {
    if (!value) return;
    form.name = value.name;
    form.slug = value.slug;
    form.description = value.description;
    if (
      !githubForm.repositoryUrl ||
      githubForm.repositoryUrl === value.githubRepository
    ) {
      githubForm.repositoryUrl = value.githubRepository ?? "";
    }
  },
  { immediate: true },
);

async function addProjectMembers() {
  if (!project.value || !canManageMembers.value || !selectedMembers.value.length)
    return;
  changingMembers.value = true;
  try {
    for (const user of selectedMembers.value) {
      const response = await $fetch<{ project: ProjectDetail }>(
        `/api/projects/${encodeURIComponent(projectId.value)}/members`,
        {
          method: "POST",
          body: {
            userId: user.id,
            permissions: ["project.read", "tasks.read", "incidents.read"],
          },
        },
      );
      data.value = { project: { ...response.project, tasks: data.value?.project.tasks ?? [] } };
    }
    selectedMembers.value = [];
    requestError.value = null;
    ElMessage.success("Project members added");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "Members could not be added."));
  } finally {
    changingMembers.value = false;
  }
}

async function removeProjectMember(member: { userId: string; displayName: string }) {
  if (!canManageMembers.value || ownerIds.value.includes(member.userId)) return;
  const confirmed = await ElMessageBox.confirm(
    `Remove ${member.displayName} from this project?`,
    "Remove project member",
    { type: "warning", confirmButtonText: "Remove" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  changingMembers.value = true;
  try {
    const response = await $fetch<{ project: ProjectDetail }>(
      `/api/projects/${encodeURIComponent(projectId.value)}/members/${encodeURIComponent(member.userId)}`,
      { method: "DELETE" },
    );
    data.value = { project: { ...response.project, tasks: data.value?.project.tasks ?? [] } };
    requestError.value = null;
    ElMessage.success("Project member removed");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The member could not be removed."));
  } finally {
    changingMembers.value = false;
  }
}

function openPermissions(member: ProjectMemberView) {
  if (!canManageMembers.value) return;
  permissionMember.value = member;
  permissionDialog.value = true;
}

async function onPermissionsSaved() {
  await refreshProject();
}

async function validateRepository(repositoryUrl: string) {
  const request = new AbortController();
  repositoryValidationRequest = request;
  repositoryValidation.state = "pending";
  repositoryValidation.message = "Repository check in progress...";
  try {
    const result = await $fetch<RepositoryValidationResult>(
      `/api/projects/${encodeURIComponent(projectId.value)}/repository/validate`,
      { method: "POST", body: { repositoryUrl }, signal: request.signal },
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
    if (repositoryValidationRequest === request) repositoryValidationRequest = undefined;
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

async function loadOverviewRepository() {
  if (!project.value?.githubRepository) return;
  overviewRepositoryPending.value = true;
  overviewRepositoryError.value = "";
  try {
    overviewRepository.value = await $fetch<RepositoryValidationResult>(
      `/api/projects/${encodeURIComponent(projectId.value)}/repository`,
      { headers },
    );
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
      { method: "PUT", body: { repositoryUrl: githubForm.repositoryUrl } },
    );
    if (data.value)
      data.value.project = {
        ...data.value.project,
        ...response.project,
        tasks: data.value.project.tasks,
      };
    repositoryValidationResult.value = response;
    repositoryValidation.state = "success";
    repositoryValidation.message = "Repository verified and saved";
    overviewRepository.value = response;
    overviewRepositoryError.value = "";
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
    const response = await $fetch<{ project: ProjectSummary }>(
      `/api/projects/${encodeURIComponent(projectId.value)}`,
      { method: "PATCH", body: form },
    );
    if (data.value)
      data.value.project = {
        ...data.value.project,
        ...response.project,
        tasks: data.value.project.tasks,
      };
    requestError.value = null;
    ElMessage.success("Project updated");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The project could not be updated."));
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
      project: ProjectSummary;
    }>(`/api/projects/${encodeURIComponent(projectId.value)}/assets/repair`, {
      method: "POST",
    });
    assetsLinkData.value = { assets: response.assets };
    if (data.value)
      data.value.project = {
        ...data.value.project,
        ...response.project,
        tasks: data.value.project.tasks,
      };
    requestError.value = null;
    ElMessage.success("Assets storage link repaired");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The Assets storage link could not be repaired."));
  } finally {
    repairingAssetsLink.value = false;
  }
}

async function setArchived(archived: boolean) {
  if (!project.value || archiving.value) return;
  const confirmed = await ElMessageBox.confirm(
    archived
      ? "Archive this project? It becomes read-only until restored."
      : "Restore this project to active projects?",
    archived ? "Archive project" : "Unarchive project",
    { type: "warning", confirmButtonText: archived ? "Archive" : "Unarchive" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  archiving.value = true;
  try {
    const response = await $fetch<{ project: ProjectSummary }>(
      `/api/projects/${encodeURIComponent(projectId.value)}/${archived ? "archive" : "unarchive"}`,
      { method: "POST" },
    );
    if (data.value)
      data.value.project = {
        ...data.value.project,
        ...response.project,
        tasks: data.value.project.tasks,
      };
    ElMessage.success(archived ? "Project archived" : "Project restored");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The project could not be updated."));
  } finally {
    archiving.value = false;
  }
}

async function loadTemplates() {
  templatesLoading.value = true;
  try {
    const response = await $fetch<{ templates: TaskTemplateView[] }>(
      `/api/projects/${encodeURIComponent(projectId.value)}/task-templates`,
    );
    templates.value = response.templates;
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "Templates could not be loaded."));
  } finally {
    templatesLoading.value = false;
  }
}

function openTemplates() {
  templateDialog.value = true;
  void loadTemplates();
}

async function deleteTemplate(template: TaskTemplateView) {
  const confirmed = await ElMessageBox.confirm(
    `Delete template “${template.name}”?`,
    "Delete template",
    { type: "warning", confirmButtonText: "Delete" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  try {
    await $fetch(
      `/api/projects/${encodeURIComponent(projectId.value)}/task-templates/${encodeURIComponent(template.id)}`,
      { method: "DELETE" },
    );
    templates.value = templates.value.filter((item) => item.id !== template.id);
    ElMessage.success("Template deleted");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The template could not be deleted."));
  }
}

async function loadIncidents() {
  if (!project.value?.capabilities.readIncidents) return;
  incidentsLoading.value = true;
  incidentsError.value = null;
  try {
    incidentPage.value = await $fetch<IncidentPage>("/api/incidents", {
      query: { projectId: projectId.value, limit: 40 },
    });
  } catch (caught) {
    incidentsError.value = caught;
  } finally {
    incidentsLoading.value = false;
  }
}

function onIncidentSaved(incident: IncidentView) {
  const index = incidentPage.value.incidents.findIndex((item) => item.id === incident.id);
  if (index >= 0) incidentPage.value.incidents[index] = incident;
  else incidentPage.value.incidents = [incident, ...incidentPage.value.incidents];
}

watch(activeTab, (tab) => {
  if (tab === "incidents" && !incidentPage.value.incidents.length)
    void loadIncidents();
});

onMounted(() => {
  if (route.hash === "#incidents") void loadIncidents();
});

useHead(() => ({
  title: project.value?.name ? `${project.value.name} · Projects` : "Project",
}));
</script>

<template>
  <section v-loading="pending" class="page project-detail">
    <BackendErrorDetails v-if="error || requestError" :error="requestError || error" />

    <template v-if="project">
      <PageHeader
        :title="project.name"
        :back-to="'/projects'"
        back-label="Projects"
        :description="`/projects/${project.slug}`"
      >
        <template #meta>
          <div class="project-meta">
            <el-tag :type="project.status === 'archived' ? 'info' : 'success'">
              {{ project.status }}
            </el-tag>
            <el-tag v-if="project.reviewLocked" type="warning">In review</el-tag>
            <span class="muted">{{ project.taskCount }} tasks · {{ project.memberCount }} members</span>
          </div>
        </template>
        <template #actions>
          <el-button v-if="canCreateTask" type="primary" :icon="Plus" @click="navigateTo(`/projects/${encodeURIComponent(projectId)}/tasks/new`)">
            Create task
          </el-button>
          <el-button v-if="canEditProjectSettings" :icon="Setting" @click="activeTab = 'settings'">Settings</el-button>
          <el-dropdown v-if="canArchive">
            <el-button text :icon="Setting" aria-label="More project actions" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="setArchived(project.status !== 'archived')">
                  {{ project.status === "archived" ? "Unarchive project" : "Archive project" }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button v-if="project.githubRepository" tag="a" :href="project.githubRepository" target="_blank" rel="noopener noreferrer">
            View on GitHub
          </el-button>
        </template>
      </PageHeader>

      <el-alert
        v-if="project.reviewLocked"
        class="review-lock-alert"
        title="Project locked for task review"
        description="Project changes are paused until a reviewer returns or completes the task in review."
        type="warning"
        :closable="false"
        show-icon
      >
        <template #default>
          <el-link v-if="project.reviewTaskId" :href="`/tasks/${encodeURIComponent(project.reviewTaskId)}`">
            Open task in review
          </el-link>
        </template>
      </el-alert>

      <el-tabs v-model="activeTab" class="project-tabs">
        <el-tab-pane label="Overview" name="overview">
          <div class="project-overview">
            <section class="surface project-description">
              <h2>About</h2>
              <MarkdownContent :source="project.description || 'No description yet.'" />
            </section>

            <section class="surface project-stats">
              <div><span>{{ project.taskCount }}</span><small>Tasks</small></div>
              <div><span>{{ project.completedTaskCount }}</span><small>Completed</small></div>
              <div><span>{{ project.memberCount }}</span><small>Members</small></div>
              <div><span>{{ project.reviewLocked ? "Yes" : "No" }}</span><small>Review lock</small></div>
            </section>

            <section class="surface project-activity">
              <h2>Activity</h2>
              <ActivityFeed ref="activityFeed" :project-id="project.id" :limit="12" compact />
            </section>

            <section class="surface project-comments">
              <CommentThread
                :project-id="project.id"
                :can-write="project.capabilities.read && project.status === 'active'"
                title="Project discussion"
                @changed="activityFeed?.refresh()"
              />
            </section>

            <section class="surface project-repository">
              <div class="project-section-header">
                <h2>Repository</h2>
                <el-button v-if="project.githubRepository" text @click="loadOverviewRepository">Refresh</el-button>
              </div>
              <div v-loading="overviewRepositoryPending">
                <el-alert
                  v-if="overviewRepositoryError"
                  title="GitHub repository unavailable"
                  :description="overviewRepositoryError"
                  type="error"
                  show-icon
                  :closable="false"
                />
                <el-empty v-else-if="!project.githubRepository" description="No GitHub repository connected." />
                <LinkedResourcePreview
                  v-else-if="overviewRepository"
                  :link="overviewRepository.readme.url"
                  :edit-link="overviewRepository.readme.editUrl"
                  :content="overviewRepository.readme.content"
                  file-type="markdown"
                />
              </div>
            </section>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Tasks" name="tasks">
          <div class="tab-panel">
            <div class="tab-toolbar">
              <el-input v-model="taskSearch" clearable placeholder="Search project tasks" />
              <div class="tab-toolbar__actions">
                <el-button @click="navigateTo(`/tasks?projectId=${encodeURIComponent(projectId)}`)">Open task board</el-button>
                <el-button v-if="canCreateTask" @click="openTemplates">Templates</el-button>
                <el-button v-if="canCreateTask" type="primary" :icon="Plus" @click="navigateTo(`/projects/${encodeURIComponent(projectId)}/tasks/new`)">
                  Create task
                </el-button>
              </div>
            </div>
            <div v-if="filteredTasks.length" class="task-list">
              <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" />
            </div>
            <el-empty v-else :image-size="84" description="No tasks have been created for this project." />
          </div>
        </el-tab-pane>

        <el-tab-pane label="Incidents" name="incidents">
          <div class="tab-panel">
            <div class="tab-toolbar">
              <p class="muted">Incidents reported against this project.</p>
              <el-button v-if="canCreateIncident" type="primary" :icon="Plus" @click="incidentDialog = true">
                Report incident
              </el-button>
            </div>
            <BackendErrorDetails v-if="incidentsError" :error="incidentsError" />
            <div v-else v-loading="incidentsLoading" class="incident-list">
              <article v-for="incident in incidentPage.incidents" :key="incident.id" class="incident-row surface">
                <div>
                  <el-tag :type="incident.severity === 'critical' ? 'danger' : incident.severity === 'high' ? 'warning' : 'info'" size="small">
                    {{ incident.severity }}
                  </el-tag>
                  <el-tag :type="incident.status === 'resolved' ? 'success' : 'info'" size="small">{{ incident.status }}</el-tag>
                  <NuxtLink :to="`/incidents/${encodeURIComponent(incident.id)}`"><strong>{{ incident.title }}</strong></NuxtLink>
                </div>
                <span class="muted">{{ incident.assignee?.displayName ?? "Unassigned" }}</span>
              </article>
              <el-empty v-if="!incidentPage.incidents.length && !incidentsLoading" :image-size="84" description="No incidents reported." />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Files" name="files">
          <div class="tab-panel">
            <div class="tab-toolbar">
              <p class="muted">Browse the assets stored for this project.</p>
              <el-button v-if="assetsLink.status === 'linked'" tag="a" :href="`/assets?projectUid=${encodeURIComponent(assetsLink.uid ?? '')}`">
                Open in Assets
              </el-button>
            </div>
            <BackendErrorDetails v-if="assetsLinkError" :error="assetsLinkError" />
            <div v-loading="assetsLinkPending">
              <el-alert v-if="assetsLink.status === 'unlinked'" title="No Assets project linked" description="An editor can allocate an Assets project from Settings." type="info" :closable="false" show-icon />
              <el-alert v-else-if="assetsLink.status === 'missing'" title="The linked Assets project is missing" description="An editor can allocate a replacement Assets project from Settings." type="warning" :closable="false" show-icon />
              <AssetsBrowser
                v-if="assetsLink.uid"
                :project-uid="assetsLink.uid"
                :show-project-filter="false"
                :show-project-column="false"
                empty-text="This project has no assets yet"
                :readonly="project.reviewLocked"
              />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Members" name="members">
          <div class="tab-panel">
            <div v-if="canManageMembers" class="member-add-row">
              <UsersInput v-model="selectedMembers" :exclude-ids="existingMemberIds" placeholder="Search users to add to this project" />
              <el-button type="primary" :loading="changingMembers" :disabled="!selectedMembers.length" @click="addProjectMembers">
                Add members
              </el-button>
            </div>
            <div class="member-list" v-loading="changingMembers">
              <article v-for="member in project.members" :key="member.userId" class="member-row surface">
                <NuxtLink :to="`/users/${encodeURIComponent(member.userId)}`" class="member-row__identity">
                  <el-avatar :size="36" :src="member.image ?? undefined">{{ initials(member.displayName) }}</el-avatar>
                  <span><strong>{{ member.displayName }}</strong><small>{{ member.role }}</small></span>
                </NuxtLink>
                <span class="member-row__permissions muted">
                  {{ member.role === "owner" ? "Full access" : `${member.permissions.length} permissions` }}
                </span>
                <div class="member-row__actions">
                  <el-button v-if="canManageMembers && member.role !== 'owner'" text @click="openPermissions(member)">Permissions</el-button>
                  <el-button v-if="canManageMembers && member.role !== 'owner'" text type="danger" @click="removeProjectMember(member)">Remove</el-button>
                </div>
              </article>
              <el-empty v-if="!project.members.length" :image-size="84" description="No project members" />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Settings" name="settings">
          <div class="settings-layout">
            <aside aria-label="Settings sections">
              <el-anchor :offset="24">
                <el-anchor-link href="#project-settings-assets" title="Assets storage" />
                <el-anchor-link v-if="canEditProjectSettings" href="#project-settings-general" title="General" />
                <el-anchor-link v-if="canEditProjectSettings" href="#project-settings-github" title="GitHub" />
                <el-anchor-link href="#project-settings-danger" title="Danger zone" />
              </el-anchor>
            </aside>

            <div class="settings-content">
              <section id="project-settings-assets" class="settings-section">
                <h2>Assets storage</h2>
                <p>The Assets project stores this project's files and assets.</p>
                <el-divider />
                <div v-loading="assetsLinkPending" class="assets-link-settings">
                  <el-descriptions :column="1" border>
                    <el-descriptions-item label="Status"><el-tag :type="assetsStatusType">{{ assetsLink.status }}</el-tag></el-descriptions-item>
                    <el-descriptions-item label="Assets project UID">
                      <pre v-if="assetsLink.uid">{{ assetsLink.uid }}</pre>
                      <span v-else>Not allocated</span>
                    </el-descriptions-item>
                  </el-descriptions>
                  <el-alert v-if="assetsLink.status === 'missing'" title="The linked Assets project is missing" description="An editor can allocate a replacement Assets project. Existing healthy links are preserved." type="warning" :closable="false" show-icon />
                  <el-alert v-else-if="assetsLink.status === 'unavailable'" title="The Assets link could not be verified" description="Repair is disabled until the Assets service can verify the linked project." type="warning" :closable="false" show-icon />
                  <el-alert v-else-if="assetsLink.status === 'unlinked'" title="No Assets project is linked" description="An editor can allocate an Assets project now." type="info" :closable="false" show-icon />
                  <div class="assets-link-actions">
                    <el-button v-if="assetsLink.uid && assetsLink.status === 'linked'" tag="a" :href="`/assets?projectUid=${encodeURIComponent(assetsLink.uid)}`">Open in Assets</el-button>
                    <el-button v-if="canEditProjectSettings && (assetsLink.status === 'unlinked' || assetsLink.status === 'missing')" type="primary" :disabled="!canRepairAssetsLink" :loading="repairingAssetsLink" @click="repairAssetsLink">
                      Repair Assets link
                    </el-button>
                  </div>
                </div>
              </section>

              <section v-if="canEditProjectSettings" id="project-settings-general" class="settings-section">
                <h2>General</h2>
                <p>Update the project's name, URL slug, and description.</p>
                <el-divider />
                <el-form label-position="top" @submit.prevent="saveProject">
                  <el-form-item label="Project name"><el-input v-model="form.name" maxlength="120" show-word-limit /></el-form-item>
                  <el-form-item label="Slug"><el-input v-model="form.slug"><template #prepend>/projects/</template></el-input></el-form-item>
                  <el-form-item label="README description">
                    <el-input v-model="form.description" type="textarea" :rows="13" maxlength="50000" />
                  </el-form-item>
                  <el-button type="primary" :loading="saving" @click="saveProject">Save</el-button>
                </el-form>
              </section>

              <section v-if="canEditProjectSettings" id="project-settings-github" class="settings-section">
                <h2>GitHub</h2>
                <p>Connect a GitHub repository to show its README on the overview.</p>
                <el-divider />
                <el-form label-position="top" @submit.prevent>
                  <el-form-item label="Repository URL">
                    <el-input v-model="githubForm.repositoryUrl" placeholder="https://github.com/organization/repository">
                      <template #suffix>
                        <el-icon v-if="repositoryValidation.state === 'pending'" class="repository-status-icon is-loading" aria-label="Repository check in progress"><Loading /></el-icon>
                        <el-icon v-else-if="repositoryValidation.state === 'success'" class="repository-status-icon is-success" aria-label="Repository check succeeded"><CircleCheckFilled /></el-icon>
                        <el-icon v-else-if="repositoryValidation.state === 'error'" class="repository-status-icon is-error" aria-label="Repository check failed"><CircleCloseFilled /></el-icon>
                      </template>
                    </el-input>
                    <p v-if="repositoryValidation.message" class="repository-validation-message" :class="`is-${repositoryValidation.state}`" aria-live="polite">{{ repositoryValidation.message }}</p>
                  </el-form-item>
                  <el-form-item label="Default branch"><el-input v-model="githubForm.defaultBranch" placeholder="main" /></el-form-item>
                  <el-button type="primary" :disabled="!canSaveGithub" :loading="savingGithub" @click="saveGithubRepository">Save GitHub settings</el-button>
                </el-form>
              </section>

              <section id="project-settings-danger" class="settings-section">
                <h2>Danger zone</h2>
                <p>Archiving keeps all data and makes the project read-only.</p>
                <el-divider />
                <el-button v-if="canArchive" type="warning" plain :loading="archiving" @click="setArchived(project?.status !== 'archived')">
                  {{ project?.status === "archived" ? "Unarchive project" : "Archive project" }}
                </el-button>
                <p v-else class="muted">You do not have permission to archive this project.</p>
              </section>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <MemberPermissionsDialog
      v-model="permissionDialog"
      :project-id="projectId"
      :member="permissionMember"
      @saved="onPermissionsSaved"
    />
    <IncidentDialog
      v-model="incidentDialog"
      :projects="projectOptions"
      @saved="onIncidentSaved"
    />
    <el-dialog v-model="templateDialog" title="Task templates" width="min(560px, 94vw)">
      <div v-loading="templatesLoading" class="template-list">
        <div v-for="template in templates" :key="template.id" class="template-row surface">
          <div>
            <strong>{{ template.name }}</strong>
            <small>{{ template.title }}</small>
          </div>
          <el-button v-if="canCreateTask" text type="danger" @click="deleteTemplate(template)">
            Delete
          </el-button>
        </div>
        <p v-if="!templates.length && !templatesLoading" class="muted">
          Save a task as a template from its detail page.
        </p>
      </div>
    </el-dialog>
  </section>
</template>

<style scoped>
.project-detail {
  display: grid;
  gap: 14px;
}

.project-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
}

.review-lock-alert {
  margin-bottom: 8px;
}

.project-tabs {
  min-width: 0;
}

.project-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
  padding-top: 8px;
}

.project-description,
.project-activity,
.project-comments,
.project-repository,
.project-stats {
  padding: 16px;
}

.project-comments {
  grid-column: 1 / -1;
}

.project-description h2,
.project-activity h2,
.project-repository h2,
.project-stats h2 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 650;
}

.project-activity,
.project-repository {
  grid-column: 1 / -1;
}

.project-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 12px;
}

.project-stats div {
  display: grid;
}

.project-stats span {
  font-size: 24px;
  font-weight: 700;
}

.project-stats small {
  color: var(--text-muted);
  font-size: 11px;
}

.project-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tab-panel {
  display: grid;
  gap: 12px;
  padding-top: 8px;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tab-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-list {
  display: grid;
  gap: 6px;
}

.template-list {
  display: grid;
  gap: 6px;
}

.template-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 11px;
}

.template-row div {
  display: grid;
  min-width: 0;
}

.template-row strong,
.template-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-row small {
  color: var(--text-muted);
  font-size: 11px;
}

.incident-list {
  display: grid;
  gap: 6px;
}

.incident-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
}

.incident-row > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.incident-row a {
  color: var(--text-primary);
  text-decoration: none;
}

.incident-row a:hover {
  color: var(--accent);
}

.member-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  margin-bottom: 12px;
}

.member-list {
  display: grid;
  gap: 6px;
}

.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}

.member-row__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.member-row__identity span {
  display: grid;
  min-width: 0;
}

.member-row__identity strong,
.member-row__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-row__identity small {
  color: var(--text-muted);
  font-size: 11px;
  text-transform: capitalize;
}

.member-row__permissions {
  font-size: 12px;
}

.member-row__actions {
  display: flex;
  gap: 2px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 760px);
  gap: 32px;
  align-items: start;
  padding-top: 8px;
}

.settings-content {
  min-width: 0;
}

.settings-section {
  scroll-margin-top: 24px;
}

.settings-section + .settings-section {
  margin-top: 48px;
}

.settings-section h2 {
  margin: 0;
  font-size: 16px;
}

.settings-section p {
  margin: 8px 0 0;
  color: var(--text-muted);
}

.settings-section :deep(.el-divider) {
  margin: 16px 0 20px;
}

.assets-link-settings {
  min-height: 100px;
}

.assets-link-settings .el-alert {
  margin-top: 14px;
}

.assets-link-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: 12px/1.5 var(--font-mono);
}

.repository-status-icon.is-success,
.repository-validation-message.is-success {
  color: var(--status-success);
}

.repository-status-icon.is-error,
.repository-validation-message.is-error {
  color: var(--status-danger);
}

.repository-validation-message {
  width: 100%;
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

@media (max-width: 1023px) {
  .project-overview {
    grid-template-columns: 1fr;
  }

  .project-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

@media (max-width: 767px) {
  .tab-toolbar,
  .member-add-row,
  .member-row {
    grid-template-columns: 1fr;
    align-items: stretch;
    flex-direction: column;
  }

  .tab-toolbar {
    display: grid;
  }

  .member-row__actions {
    justify-content: flex-end;
  }

  .project-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

