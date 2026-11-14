<script setup lang="ts">
import { Delete, EditPen, Plus, SwitchButton } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { AssetProject } from "~/composables/useAssetsApi";

const route = useRoute();
const {
  connection,
  projects,
  projectsPending,
  connectionError,
  projectsError,
  ensureConnection,
  assetsFetch,
  refreshProjects,
  disconnectAssetsConnection,
  connectAssets,
} = useAssetsApi();

const activeTab = useHashTab("assets", ["assets", "projects"]);
const requestError = shallowRef<unknown>(null);
const busy = ref(false);
const disconnecting = ref(false);
const projectDialog = ref(false);
const editingProject = ref<AssetProject | null>(null);
const projectForm = reactive({ name: "", description: "" });

onMounted(async () => {
  if (route.query.auth === "connected")
    ElMessage.success("Connected to DevConnect Assets");
  if (route.query.auth === "mismatch")
    ElMessage.error(
      "The DevConnect Assets account must match the user signed in to the portal",
    );
  if (route.query.auth === "failed" || route.query.auth === "denied")
    ElMessage.error("DevConnect Assets sign-in was not completed");
  await ensureConnection();
  await refreshProjects();
});

function reportError(caught: unknown, fallback: string) {
  requestError.value = caught;
  ElMessage.error(backendErrorMessage(caught, fallback));
}

async function disconnect() {
  if (disconnecting.value) return;
  disconnecting.value = true;
  try {
    await disconnectAssetsConnection();
    requestError.value = null;
    await refreshProjects(true);
    ElMessage.success("Logged out of DevConnect Assets");
  } catch (caught) {
    reportError(caught, "Could not log out of DevConnect Assets.");
  } finally {
    disconnecting.value = false;
  }
}

function openProject(project?: AssetProject) {
  if (!connection.value.connected) return;
  editingProject.value = project ?? null;
  projectForm.name = project?.name ?? "";
  projectForm.description = project?.description ?? "";
  projectDialog.value = true;
}

async function saveProject() {
  busy.value = true;
  try {
    const project = editingProject.value;
    await assetsFetch(
      project ? `/project/${encodeURIComponent(project.uid)}` : "/project",
      {
        method: project ? "PUT" : "POST",
        body: { ...projectForm },
      },
    );
    requestError.value = null;
    projectDialog.value = false;
    await refreshProjects(true);
    ElMessage.success(
      project ? "Asset project updated" : "Asset project created",
    );
  } catch (caught) {
    reportError(caught, "The asset project could not be saved.");
  } finally {
    busy.value = false;
  }
}

async function deleteProject(project: AssetProject) {
  if (!connection.value.connected) return;
  const confirmed = await ElMessageBox.confirm(
    `Delete ${project.name}? Projects containing assets cannot be deleted.`,
    "Delete asset project",
    { type: "warning", confirmButtonText: "Delete" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  try {
    await assetsFetch(`/project/${encodeURIComponent(project.uid)}`, {
      method: "DELETE",
    });
    await refreshProjects(true);
    ElMessage.success("Asset project deleted");
  } catch (caught) {
    reportError(caught, "The asset project could not be deleted.");
  }
}
</script>

<template>
  <section class="assets-page page">
    <PageHeader title="Assets" description="Browse and manage files shared through DevConnect Assets." />
    <BackendErrorDetails
      v-if="requestError || connectionError || projectsError"
      :error="requestError || connectionError || projectsError"
    />

    <el-alert
      v-if="connection.connected"
      class="connection-banner"
      type="success"
      :closable="false"
      title="Connected to DevConnect Assets"
    >
      <el-button
        size="small"
        :icon="SwitchButton"
        :loading="disconnecting"
        @click="disconnect"
      >
        Log out of Assets
      </el-button>
    </el-alert>

    <el-tabs v-model="activeTab" class="assets-tabs">
      <el-tab-pane label="Assets" name="assets">
        <AssetsBrowser :key="String(connection.connected)" />
      </el-tab-pane>

      <el-tab-pane label="Asset projects" name="projects">
        <el-alert :closable="false" show-icon>
          This page manages the asset server's project configuration. To see general assigned tasks, go
          <NuxtLink to="/tasks">to Tasks</NuxtLink>.
        </el-alert>

        <el-alert
          v-if="!connection.connected"
          class="connection-banner"
          type="info"
          :closable="false"
          title="Connect to DevConnect Assets to manage asset projects."
        >
          <el-button size="small" type="primary" @click="connectAssets">
            {{ connection.portalSignedIn ? "Connect Assets" : "Sign in" }}
          </el-button>
        </el-alert>

        <div class="tab-toolbar">
          <span>Assets server project registry</span>
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="!connection.connected"
            @click="openProject()"
          >
            New project
          </el-button>
        </div>

        <el-card shadow="never" v-loading="projectsPending">
          <el-table class="desktop-table" :data="projects" empty-text="No asset projects found">
            <el-table-column prop="name" label="Name" min-width="200" />
            <el-table-column prop="uid" label="Project UID" min-width="300" />
            <el-table-column
              prop="description"
              label="Description"
              min-width="240"
            />
            <el-table-column label="Actions" width="125" fixed="right">
              <template #default="{ row }">
                <el-button
                  text
                  :icon="EditPen"
                  aria-label="Edit project"
                  :disabled="!connection.connected"
                  @click="openProject(row as AssetProject)"
                />
                <el-button
                  text
                  type="danger"
                  :icon="Delete"
                  aria-label="Delete project"
                  :disabled="!connection.connected"
                  @click="deleteProject(row as AssetProject)"
                />
              </template>
            </el-table-column>
          </el-table>

          <div class="mobile-card-list">
            <article v-for="project in projects" :key="project.uid" class="asset-project-card surface">
              <div>
                <strong>{{ project.name }}</strong>
                <small>{{ project.description || "No description" }}</small>
                <span class="mono">{{ project.uid }}</span>
              </div>
              <div class="asset-project-card__actions">
                <el-button text :icon="EditPen" aria-label="Edit project" :disabled="!connection.connected" @click="openProject(project)" />
                <el-button text type="danger" :icon="Delete" aria-label="Delete project" :disabled="!connection.connected" @click="deleteProject(project)" />
              </div>
            </article>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="projectDialog"
      :title="editingProject ? 'Edit asset project' : 'New asset project'"
      width="min(560px, 94vw)"
    >
      <el-form label-position="top" @submit.prevent="saveProject">
        <el-form-item label="Name">
          <el-input v-model="projectForm.name" maxlength="120" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input
            v-model="projectForm.description"
            type="textarea"
            :rows="4"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" @click="saveProject">
          Save
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.connection-banner {
  margin-bottom: 14px;
}
.connection-banner :deep(.el-alert__description) {
  margin-top: 10px;
}
.assets-tabs :deep(.el-tabs__header) {
  margin-bottom: 18px;
}
.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.asset-project-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
}

.asset-project-card > div:first-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.asset-project-card strong,
.asset-project-card small,
.asset-project-card .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-project-card small {
  color: var(--text-muted);
  font-size: 12px;
}

.asset-project-card__actions {
  display: flex;
  gap: 2px;
}

@media (max-width: 640px) {
  .tab-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
