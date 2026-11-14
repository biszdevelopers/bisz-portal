<script setup lang="ts">
import { FolderAdd, Search } from "@element-plus/icons-vue";
import type { ProjectSummary } from "~/shared/contracts";

const {
  capabilities,
  pending: accessPending,
  error: accessError,
} = usePortalAccess();
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error, refresh } = await useFetch<{
  projects: ProjectSummary[];
}>("/api/projects", { headers });
const activeTab = ref<"active" | "archived">("active");
const search = ref("");
const sort = ref<"updated" | "name" | "progress">("updated");
const archiving = ref<string | null>(null);

const projects = computed(() => data.value?.projects ?? []);
const filteredProjects = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  return [...projects.value]
    .filter((project) => project.status === activeTab.value)
    .filter(
      (project) =>
        !needle ||
        project.name.toLocaleLowerCase().includes(needle) ||
        project.description.toLocaleLowerCase().includes(needle),
    )
    .sort((left, right) => {
      if (sort.value === "name") return left.name.localeCompare(right.name);
      if (sort.value === "progress") {
        const leftProgress = left.taskCount
          ? left.completedTaskCount / left.taskCount
          : 0;
        const rightProgress = right.taskCount
          ? right.completedTaskCount / right.taskCount
          : 0;
        return rightProgress - leftProgress;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
});
const counts = computed(() => ({
  active: projects.value.filter((project) => project.status === "active").length,
  archived: projects.value.filter((project) => project.status === "archived")
    .length,
}));

function openCreate() {
  return navigateTo("/projects/new");
}

function openProject(project: ProjectSummary) {
  return navigateTo(`/projects/${encodeURIComponent(project.id)}`);
}

async function setArchived(project: ProjectSummary, archived: boolean) {
  if (archiving.value) return;
  const confirmed = await ElMessageBox.confirm(
    archived
      ? `Archive ${project.name}? It becomes read-only until restored.`
      : `Restore ${project.name} to active projects?`,
    archived ? "Archive project" : "Unarchive project",
    { type: "warning", confirmButtonText: archived ? "Archive" : "Unarchive" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  archiving.value = project.id;
  try {
    const response = await $fetch<{ project: ProjectSummary }>(
      `/api/projects/${encodeURIComponent(project.id)}/${archived ? "archive" : "unarchive"}`,
      { method: "POST" },
    );
    if (data.value) {
      data.value.projects = data.value.projects.map((item) =>
        item.id === response.project.id ? response.project : item,
      );
    }
    ElMessage.success(archived ? "Project archived" : "Project restored");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The project could not be updated."));
  } finally {
    archiving.value = null;
  }
}

useHead({ title: "Projects · DevConnect" });
</script>

<template>
  <section class="page projects-page">
    <PageHeader title="Projects" description="Manage current and archived projects.">
      <template #actions>
        <el-tooltip
          :disabled="capabilities.projectsCreate"
          content="Requires BiszPortal.Projects.create"
        >
          <span>
            <el-button
              type="primary"
              :icon="FolderAdd"
              :disabled="!capabilities.projectsCreate"
              @click="openCreate"
              >New project</el-button
            >
          </span>
        </el-tooltip>
      </template>
    </PageHeader>

    <BackendErrorDetails v-if="error || accessError" :error="error || accessError" />
    <AccessDenied
      v-else-if="!accessPending && !capabilities.projectsRead"
      description="You need BiszPortal.Projects.read to view projects."
    />
    <div v-else class="project-surface" v-loading="pending || Boolean(archiving)">
      <div class="project-toolbar surface">
        <el-input
          v-model="search"
          :prefix-icon="Search"
          clearable
          placeholder="Search projects"
          aria-label="Search projects"
        />
        <el-select v-model="sort" aria-label="Sort projects">
          <el-option label="Recently updated" value="updated" />
          <el-option label="Name" value="name" />
          <el-option label="Progress" value="progress" />
        </el-select>
      </div>

      <el-tabs v-model="activeTab">
        <el-tab-pane name="active">
          <template #label>
            Active <el-tag size="small" round>{{ counts.active }}</el-tag>
          </template>
        </el-tab-pane>
        <el-tab-pane name="archived">
          <template #label>
            Archived <el-tag size="small" type="info" round>{{ counts.archived }}</el-tag>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div v-if="filteredProjects.length" class="project-grid">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.id"
          :project="project"
          @select="openProject"
          @archive="setArchived"
        />
      </div>
      <el-empty
        v-else
        :description="
          search
            ? 'No projects match your search.'
            : activeTab === 'active'
              ? 'No active projects yet.'
              : 'No archived projects.'
        "
      >
        <el-button
          v-if="activeTab === 'active' && capabilities.projectsCreate && !search"
          type="primary"
          :icon="FolderAdd"
          @click="openCreate"
          >Create your first project</el-button
        >
      </el-empty>
    </div>
  </section>
</template>

<style scoped>
.projects-page {
  display: grid;
  gap: 14px;
}

.project-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.project-surface :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.project-surface :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.project-surface :deep(.el-tabs__item) {
  gap: 7px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 14px;
  padding-top: 6px;
}

@media (max-width: 600px) {
  .project-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
