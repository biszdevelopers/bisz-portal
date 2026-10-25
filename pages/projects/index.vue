<script setup lang="ts">
import { FolderAdd } from "@element-plus/icons-vue";
import type { ProjectSummary } from "~/shared/contracts";

const {
  capabilities,
  pending: accessPending,
  error: accessError,
} = usePortalAccess();
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{
  projects: ProjectSummary[];
}>("/api/projects", { headers });
const activeTab = ref<"active" | "archived">("active");

const projects = computed(() => data.value?.projects ?? []);
const filteredProjects = computed(() =>
  projects.value.filter((project) => project.status === activeTab.value),
);

function openCreate() {
  return navigateTo("/projects/new");
}

function openProject(project: ProjectSummary) {
  return navigateTo(`/projects/${encodeURIComponent(project.id)}`);
}
</script>

<template>
  <section>
    <header class="page-header projects-header">
      <div>
        <h1>Projects</h1>
        <p>
          Manage current projects
        </p>
      </div>
      <el-tooltip
        :disabled="capabilities.projectsCreate"
        content="Requires BiszPortal.Projects.create"
      >
        <span
          ><el-button
            type="primary"
            :icon="FolderAdd"
            :disabled="!capabilities.projectsCreate"
            @click="openCreate"
            >New project</el-button
          ></span
        >
      </el-tooltip>
    </header>

    <BackendErrorDetails
      v-if="error || accessError"
      :error="error || accessError"
    />
    <AccessDenied
      v-else-if="!accessPending && !capabilities.projectsRead"
      description="You need BiszPortal.Projects.read to view projects. The navigation and workspace remain visible so everyone has the same portal structure."
    />
    <div v-else class="project-surface" v-loading="pending">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="active"
          ><template #label
            >Active
            <el-tag size="small" round>{{
              projects.filter((p) => p.status === "active").length
            }}</el-tag></template
          ></el-tab-pane
        >
        <el-tab-pane name="archived"
          ><template #label
            >Archived
            <el-tag size="small" type="info" round>{{
              projects.filter((p) => p.status === "archived").length
            }}</el-tag></template
          ></el-tab-pane
        >
      </el-tabs>
      <div v-if="filteredProjects.length" class="project-grid">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.id"
          :project="project"
          @select="openProject"
        />
      </div>
      <el-empty
        v-else
        :description="
          activeTab === 'active'
            ? 'No active projects yet.'
            : 'No archived projects.'
        "
      />
    </div>
  </section>
</template>

<style scoped>
.projects-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 16px;
  padding-top: 6px;
}
@media (max-width: 600px) {
  .projects-header {
    align-items: stretch;
    flex-direction: column;
  }
  .projects-header > div {
    min-width: 0;
  }
  .projects-header > span {
    display: block;
    width: 100%;
  }
  .projects-header .el-button {
    width: 100%;
  }
}
</style>
