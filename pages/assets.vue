<script setup lang="ts">
import { Delete, Download, EditPen, Link, MoreFilled, Plus, SwitchButton, Upload } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";

type AssetVersion = {
  version: string;
  sha256: string;
  originalFileName?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};
type AssetItem = AssetVersion & {
  id: string;
  projectUid: string;
};
type AssetVersionRow = AssetVersion & {
  rowKey: string;
  rowType: "version";
  asset: AssetItem;
};
type AssetObjectRow = AssetItem & {
  rowKey: string;
  rowType: "asset";
  hasChildren: true;
};
type AssetTableRow = AssetObjectRow | AssetVersionRow;
type AssetList = { items: AssetItem[]; page: number; pageSize: number; total: number };
type AssetVersionList = { id: string; items: AssetVersion[] };
type AssetProject = { uid: string; name: string; description: string };
type ProjectList = { projects: AssetProject[] };
type Connection = { portalSignedIn: boolean; connected: boolean; userId: string | null };
type UploadSession = { sessionToken: string; projectUid: string };

const config = useRuntimeConfig();
const route = useRoute();
const activeTab = ref("assets");
const page = ref(1);
const pageSize = 20;
const requestedProjectUid = Array.isArray(route.query.projectUid)
  ? route.query.projectUid[0]
  : route.query.projectUid;
const projectFilter = ref(
  typeof requestedProjectUid === "string" ? requestedProjectUid : "",
);
const requestError = shallowRef<unknown>(null);
const busy = ref(false);
const disconnecting = ref(false);
const connectDialog = ref(false);
const projectDialog = ref(false);
const editingProject = ref<AssetProject | null>(null);
const projectForm = reactive({ name: "", description: "" });
const renameDialog = ref(false);
const renamingAsset = ref<AssetItem | null>(null);
const renameValue = ref("");
const uploadDialog = ref(false);
const uploadProjectUid = ref("");
const uploadObjectId = ref("");
const uploadFiles = ref<File[]>([]);
const uploadProgress = ref<number | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const assetBase = computed(() => config.public.assetsApiUrl.replace(/\/$/, ""));
const connection = ref<Connection>({ portalSignedIn: false, connected: false, userId: null });
const assetData = ref<AssetList | null>(null);
const projectData = ref<ProjectList | null>(null);
const assetsPending = ref(true);
const projectsPending = ref(true);
const assetsError = shallowRef<unknown>(null);
const projectsError = shallowRef<unknown>(null);
const projects = computed(() => projectData.value?.projects ?? []);
const projectNames = computed(() => new Map(projects.value.map((project) => [project.uid, project.name])));
const assetRows = computed<AssetObjectRow[]>(() => (assetData.value?.items ?? []).map((asset) => ({
  ...asset,
  rowKey: `asset:${asset.id}:${asset.version}`,
  rowType: "asset",
  hasChildren: true,
})));

watch(projectFilter, () => { page.value = 1; void refreshAssets(); });
watch(page, () => { void refreshAssets(); });
onMounted(async () => {
  if (route.query.auth === "connected") ElMessage.success("Connected to DevConnect Assets");
  if (route.query.auth === "mismatch")
    ElMessage.error("The DevConnect Assets account must match the user signed in to the portal");
  if (route.query.auth === "failed" || route.query.auth === "denied")
    ElMessage.error("DevConnect Assets sign-in was not completed");
  try {
    connection.value = await $fetch<Connection>("/api/assets/connection");
    if (connection.value.connected) await acquireToken();
    else if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
    else clearAllAssetsBrowserTokens();
  } catch (caught) {
    reportError(caught, "Could not check the Assets connection.");
    if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
    connection.value.connected = false;
  }
  await Promise.all([refreshAssets(), refreshProjects()]);
});

async function acquireToken(force = false): Promise<string | null> {
  const userId = connection.value.userId;
  if (!connection.value.connected || !userId) return null;
  if (!force) {
    const saved = readAssetsBrowserToken(userId);
    if (saved) return saved;
  }
  const result = await $fetch<{ accessToken: string; userId: string }>(
    force ? "/api/assets/token?force=1" : "/api/assets/token", { method: "POST" },
  );
  if (result.userId !== userId) throw new Error("The portal account changed. Reconnect Assets.");
  saveAssetsBrowserToken(userId, result.accessToken);
  return result.accessToken;
}

async function assetsFetch<T>(path: string, options: {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: FormData | Record<string, unknown>;
  sessionToken?: string;
  authenticated?: boolean;
  retry?: boolean;
} = {}): Promise<T> {
  const authenticated = options.authenticated ?? connection.value.connected;
  const token = authenticated ? await acquireToken() : null;
  if (authenticated && !token) throw new Error("Connect to DevConnect Assets first.");
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${assetBase.value}${path}`, {
    method: options.method ?? "GET",
    credentials: "omit",
    redirect: "error",
    cache: authenticated ? "no-store" : "default",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.sessionToken ? { "X-Upload-Session-Token": options.sessionToken } : {}),
      ...(options.body && !isForm ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body == null ? undefined
      : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
  });
  if (response.status === 401 && authenticated && options.retry !== false) {
    if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
    try { await acquireToken(true); }
    catch (caught) {
      connection.value.connected = false;
      throw caught;
    }
    return assetsFetch<T>(path, { ...options, retry: false });
  }
  if (response.status === 401 && authenticated) {
    if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
    connection.value.connected = false;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error_description || payload.message || `Assets API returned ${response.status}`);
  }
  return response.status === 204 ? {} as T : await response.json() as T;
}

async function uploadFormData<T>(
  path: string,
  body: FormData,
  sessionToken: string,
  retry = true,
): Promise<T> {
  const token = await acquireToken();
  if (!token) throw new Error("Connect to DevConnect Assets first.");

  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${assetBase.value}${path}`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("X-Upload-Session-Token", sessionToken);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        uploadProgress.value = Math.min(100, Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => resolve({ status: request.status, body: request.responseText }));
    request.addEventListener("error", () => reject(new Error("The upload could not reach the Assets API.")));
    request.addEventListener("abort", () => reject(new Error("The upload was cancelled.")));
    request.send(body);
  });

  if (response.status === 401 && retry) {
    if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
    try { await acquireToken(true); }
    catch (caught) {
      connection.value.connected = false;
      throw caught;
    }
    uploadProgress.value = 0;
    return uploadFormData<T>(path, body, sessionToken, false);
  }
  if (response.status === 401) {
    if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
    connection.value.connected = false;
  }
  if (response.status < 200 || response.status >= 300) {
    let payload: { error_description?: string; message?: string } = {};
    try { payload = JSON.parse(response.body || "{}"); }
    catch { /* Use the status fallback when the API did not return JSON. */ }
    throw new Error(payload.error_description || payload.message || `Assets API returned ${response.status}`);
  }
  return response.status === 204 || !response.body ? {} as T : JSON.parse(response.body) as T;
}

async function refreshAssets() {
  assetsPending.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
    if (projectFilter.value) params.set("projectUid", projectFilter.value);
    assetData.value = await assetsFetch<AssetList>(`/?${params}`);
    assetsError.value = null;
  } catch (caught) { assetsError.value = caught; }
  finally { assetsPending.value = false; }
}

async function refreshProjects() {
  projectsPending.value = true;
  try {
    projectData.value = await assetsFetch<ProjectList>("/project");
    projectsError.value = null;
  } catch (caught) { projectsError.value = caught; }
  finally { projectsPending.value = false; }
}

function reportError(caught: unknown, fallback: string) {
  requestError.value = caught;
  ElMessage.error(backendErrorMessage(caught, fallback));
}

function requireConnection() {
  if (connection.value?.connected) return true;
  connectDialog.value = true;
  return false;
}

function connect() {
  navigateTo(
    connection.value?.portalSignedIn
      ? "/api/auth/callback/assets"
      : "/api/auth/callback/basis-auth",
    { external: true },
  );
}

async function disconnect() {
  if (disconnecting.value) return;
  disconnecting.value = true;
  try {
    await $fetch("/api/assets/connection", { method: "DELETE" });
    if (connection.value.userId)
      clearAssetsBrowserToken(connection.value.userId);
    else
      clearAllAssetsBrowserTokens();
    connection.value.connected = false;
    requestError.value = null;
    await Promise.all([refreshAssets(), refreshProjects()]);
    ElMessage.success("Logged out of DevConnect Assets");
  } catch (caught) {
    reportError(caught, "Could not log out of DevConnect Assets.");
  } finally {
    disconnecting.value = false;
  }
}

async function loadAssetVersions(
  row: AssetTableRow,
  _treeNode: unknown,
  resolve: (rows: AssetVersionRow[]) => void,
) {
  if (row.rowType !== "asset") {
    resolve([]);
    return;
  }
  try {
    const result = await assetsFetch<AssetVersionList>(
      `/assets/${encodeURIComponent(row.id)}/versions`,
    );
    resolve(result.items.map((version) => ({
      ...version,
      rowKey: `version:${row.id}:${version.version}`,
      rowType: "version",
      asset: row,
    })));
  } catch (caught) {
    resolve([]);
    reportError(caught, "The asset versions could not be loaded.");
  }
}

async function downloadAsset(asset: AssetItem, version: AssetVersion) {
  try {
    let token = connection.value.connected ? await acquireToken() : null;
    const assetPath = `/${encodeURIComponent(asset.id)}/${encodeURIComponent(version.version)}`;
    const download = (bearer: string | null) => fetch(`${assetBase.value}${assetPath}`, {
      credentials: "omit", redirect: "error", cache: bearer ? "no-store" : "default",
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });
    let response = await download(token);
    if (response.status === 401 && token) {
      if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
      token = await acquireToken(true);
      response = await download(token);
    }
    if (response.status === 401 && token) {
      if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
      connection.value.connected = false;
    }
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = version.originalFileName || asset.originalFileName || asset.id;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (caught) { reportError(caught, "The asset could not be downloaded."); }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function openProject(project?: AssetProject) {
  if (!requireConnection()) return;
  editingProject.value = project ?? null;
  projectForm.name = project?.name ?? "";
  projectForm.description = project?.description ?? "";
  projectDialog.value = true;
}

async function saveProject() {
  busy.value = true;
  try {
    const project = editingProject.value;
    await assetsFetch(project
      ? `/project/${encodeURIComponent(project.uid)}`
      : "/project", {
      method: project ? "PUT" : "POST",
      body: { ...projectForm },
    });
    requestError.value = null;
    projectDialog.value = false;
    await refreshProjects();
    ElMessage.success(project ? "Asset project updated" : "Asset project created");
  } catch (caught) {
    reportError(caught, "The asset project could not be saved.");
  } finally { busy.value = false; }
}

async function deleteProject(project: AssetProject) {
  if (!requireConnection()) return;
  const confirmed = await ElMessageBox.confirm(
    `Delete ${project.name}? Projects containing assets cannot be deleted.`,
    "Delete asset project", { type: "warning", confirmButtonText: "Delete" },
  ).then(() => true, () => false);
  if (!confirmed) return;
  try {
    await assetsFetch(`/project/${encodeURIComponent(project.uid)}`, { method: "DELETE" });
    if (projectFilter.value === project.uid) projectFilter.value = "";
    await refreshProjects();
    ElMessage.success("Asset project deleted");
  } catch (caught) { reportError(caught, "The asset project could not be deleted."); }
}

function openRename(asset: AssetItem) {
  if (!requireConnection()) return;
  renamingAsset.value = asset;
  renameValue.value = asset.originalFileName ?? asset.id;
  renameDialog.value = true;
}

async function renameAsset() {
  if (!renamingAsset.value) return;
  busy.value = true;
  try {
    await assetsFetch(`/assets/${encodeURIComponent(renamingAsset.value.id)}`, {
      method: "PATCH", body: { originalFileName: renameValue.value },
    });
    requestError.value = null;
    renameDialog.value = false;
    await refreshAssets();
    ElMessage.success("Filename updated");
  } catch (caught) { reportError(caught, "The filename could not be updated."); }
  finally { busy.value = false; }
}

async function deleteAsset(asset: AssetItem) {
  if (!requireConnection()) return;
  const confirmed = await ElMessageBox.confirm(
    `Permanently delete ${asset.originalFileName || asset.id} and every version?`,
    "Delete asset", { type: "error", confirmButtonText: "Delete" },
  ).then(() => true, () => false);
  if (!confirmed) return;
  try {
    await assetsFetch(`/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
    await refreshAssets();
    ElMessage.success("Asset deleted");
  } catch (caught) { reportError(caught, "The asset could not be deleted."); }
}

function openUpload(asset?: AssetItem) {
  if (!requireConnection()) return;
  uploadProjectUid.value = asset?.projectUid ?? projectFilter.value;
  uploadObjectId.value = asset?.id ?? "";
  uploadFiles.value = [];
  uploadProgress.value = null;
  if (fileInput.value) fileInput.value.value = "";
  uploadDialog.value = true;
}

function selectFiles(event: Event) {
  uploadFiles.value = Array.from((event.target as HTMLInputElement).files ?? []);
}

async function uploadAssets() {
  if (!uploadProjectUid.value || !uploadFiles.value.length) return;
  if (uploadFiles.value.length > 20 || uploadFiles.value.some((file) => file.size > 100 * 1024 * 1024)) {
    ElMessage.error("Select at most 20 files, each no larger than 100 MiB");
    return;
  }
  if (uploadObjectId.value && uploadFiles.value.length !== 1) {
    ElMessage.error("Select one file when uploading a new version");
    return;
  }
  busy.value = true;
  uploadProgress.value = 0;
  let sessionToken: string | undefined;
  try {
    const session = await assetsFetch<UploadSession>("/sessions", {
      method: "POST", body: { projectUid: uploadProjectUid.value },
    });
    sessionToken = session.sessionToken;
    const formData = new FormData();
    formData.set("manifest", JSON.stringify({
      files: uploadFiles.value.map((_, index) => ({
        fieldName: `file${index}`,
        ...(uploadObjectId.value ? { objectId: uploadObjectId.value } : {}),
      })),
    }));
    uploadFiles.value.forEach((file, index) => formData.append(`file${index}`, file));
    await uploadFormData("/assets", formData, sessionToken);
    requestError.value = null;
    uploadDialog.value = false;
    await refreshAssets();
    ElMessage.success("Files uploaded");
  } catch (caught) { reportError(caught, "The files could not be uploaded."); }
  finally {
    if (sessionToken) {
      void assetsFetch("/sessions", {
        method: "DELETE", sessionToken,
      }).catch(() => {});
    }
    busy.value = false;
    uploadProgress.value = null;
  }
}
</script>

<template>
  <section class="assets-page">
    <BackendErrorDetails v-if="requestError || assetsError || projectsError"
      :error="requestError || assetsError || projectsError" />

    <el-alert v-if="connection?.connected" class="connection-banner" type="success" :closable="false"
      title="Connected to DevConnect Assets">
      <el-button size="small" :icon="SwitchButton" :loading="disconnecting" @click="disconnect">
        Log out of Assets
      </el-button>
    </el-alert>

    <el-tabs v-model="activeTab" class="assets-tabs">
      <el-tab-pane label="Assets" name="assets">
        <el-alert v-if="!connection?.connected" class="connection-banner" type="info" :closable="false"
          title="Browse public assets. Connect to DevConnect Assets to manage them.">
          <el-button size="small" type="primary" @click="connect">
            {{ connection?.portalSignedIn ? "Connect Assets" : "Sign in to manage" }}
          </el-button>
        </el-alert>
        <div class="tab-toolbar">
          <el-select v-model="projectFilter" placeholder="All projects" clearable style="width: min(280px, 100%)">
            <el-option v-for="project in projects" :key="project.uid" :label="project.name" :value="project.uid" />
          </el-select>
          <el-button type="primary" :icon="Upload" @click="openUpload()">Upload files</el-button>
        </div>
        <el-card shadow="never" v-loading="assetsPending">
          <el-table :data="assetRows" row-key="rowKey" lazy :load="loadAssetVersions"
            :tree-props="{ children: 'children', hasChildren: 'hasChildren' }" empty-text="No assets found">
            <el-table-column label="File" min-width="220">
              <template #default="{ row }">
                <template v-if="(row as AssetTableRow).rowType === 'asset'">
                  {{ (row as AssetObjectRow).originalFileName || (row as AssetObjectRow).id }}
                </template>
                <template v-else>
                  <el-link :underline="false"
                    :href="assetBase + '/' + (row as AssetVersionRow).asset.id + '/' + (row as AssetVersionRow).version"
                    target="_blank">
                    <span class="version-value">Version {{ (row as AssetVersionRow).version }}</span>
                    <el-icon class="ml-2"><Link /></el-icon>
                  </el-link>
                  <el-tag v-if="(row as AssetVersionRow).version === (row as AssetVersionRow).asset.version"
                    class="latest-version-tag" size="small" type="success">
                    Latest
                  </el-tag>
                </template>
              </template>
            </el-table-column>
            <el-table-column label="Object ID" min-width="220">
              <template #default="{ row }">
                <el-tooltip v-if="(row as AssetTableRow).rowType === 'asset'" placement="right">
                  <template #content>
                    <pre>{{ (row as AssetObjectRow).id }}</pre>
                  </template>
                  <el-link :underline="false" :href="assetBase + '/' + (row as AssetObjectRow).id" target="_blank">
                    {{ (row as AssetObjectRow).id.length > 16
                      ? (row as AssetObjectRow).id.slice(0, 16) + '…'
                      : (row as AssetObjectRow).id }}
                    <el-icon class="ml-2"><Link /></el-icon>
                  </el-link>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="Project" min-width="170">
              <template #default="{ row }">
                <template v-if="(row as AssetTableRow).rowType === 'asset'">
                  {{ projectNames.get((row as AssetObjectRow).projectUid) || (row as AssetObjectRow).projectUid }}
                </template>
              </template>
            </el-table-column>
            <el-table-column label="Size" width="130">
              <template #default="{ row }">
                <template v-if="(row as AssetTableRow).rowType === 'version'">
                  {{ formatSize((row as AssetVersionRow).sizeBytes) }}
                </template>
              </template>
            </el-table-column>
            <el-table-column label="Fingerprint" width="180">
              <template #default="{ row }">
                <el-tooltip v-if="(row as AssetTableRow).rowType === 'version'" placement="top">
                  <template #content>
                    <pre>{{ (row as AssetVersionRow).sha256 }}</pre>
                  </template>
                  <span class="fingerprint-value">{{ (row as AssetVersionRow).sha256.slice(0, 16) }}…</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="Actions" width="100" fixed="right" align="right">
              <template #default="{ row }">
                <el-dropdown v-if="(row as AssetTableRow).rowType === 'asset'" trigger="click"
                  placement="bottom-end" popper-class="asset-actions-menu">
                  <el-button text :icon="MoreFilled" aria-label="Object actions" />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="openUpload(row as AssetObjectRow)">
                        <template #icon><Upload /></template>
                        Upload new version
                      </el-dropdown-item>
                      <el-dropdown-item @click="openRename(row as AssetObjectRow)">
                        <template #icon><EditPen /></template>
                        Rename
                      </el-dropdown-item>
                      <el-dropdown-item divided class="asset-action-danger" @click="deleteAsset(row as AssetObjectRow)">
                        <template #icon><Delete /></template>
                        Delete
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-dropdown v-else trigger="click" placement="bottom-end" popper-class="asset-actions-menu">
                  <el-button text :icon="MoreFilled" aria-label="Version actions" />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        @click="downloadAsset((row as AssetVersionRow).asset, row as AssetVersionRow)">
                        <template #icon><Download /></template>
                        Download
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination">
            <el-pagination v-model:current-page="page" background layout="prev, pager, next"
              :page-size="pageSize" :total="assetData?.total ?? 0" />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="Asset projects" name="projects">

        <el-alert :closable="false" show-icon>
          This page manages the asset server's project configuration. To see general assigned tasks, go <el-link>here</el-link>.
        </el-alert>

        <div class="tab-toolbar"><span>Assets server project registry</span>
          <el-button type="primary" :icon="Plus" @click="openProject()">New project</el-button>
          
        </div>

        
        
        <el-card shadow="never" v-loading="projectsPending">
          <el-table :data="projects" empty-text="No asset projects found">
            <el-table-column prop="name" label="Name" min-width="200" />
            <el-table-column prop="uid" label="Project UID" min-width="300" />
            <el-table-column prop="description" label="Description" min-width="240" />
            <el-table-column label="Actions" width="125" fixed="right">
              <template #default="{ row }">
                <el-button text :icon="EditPen" aria-label="Edit project" @click="openProject(row as AssetProject)" />
                <el-button text type="danger" :icon="Delete" aria-label="Delete project" @click="deleteProject(row as AssetProject)" />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="connectDialog" title="Connect to DevConnect Assets" width="min(480px, 94vw)">
      <p>{{ connection?.portalSignedIn
        ? "Sign in to the Assets application to manage files and projects."
        : "Sign in to the portal first, then connect to the Assets application." }}</p>
      <template #footer><el-button @click="connectDialog = false">Cancel</el-button>
        <el-button type="primary" @click="connect">{{ connection?.portalSignedIn ? "Connect Assets" : "Sign in" }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="projectDialog" :title="editingProject ? 'Edit asset project' : 'New asset project'" width="min(560px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveProject">
        <el-form-item label="Name"><el-input v-model="projectForm.name" maxlength="120" /></el-form-item>
        <el-form-item label="Description"><el-input v-model="projectForm.description" type="textarea" :rows="4" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="projectDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" @click="saveProject">Save</el-button></template>
    </el-dialog>

    <el-dialog v-model="renameDialog" title="Rename file" width="min(480px, 94vw)">
      <el-form label-position="top" @submit.prevent="renameAsset">
        <el-form-item label="Displayed filename"><el-input v-model="renameValue" maxlength="255" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="renameDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" @click="renameAsset">Save</el-button></template>
    </el-dialog>

    <el-dialog v-model="uploadDialog" :title="uploadObjectId ? 'Upload new version' : 'Upload files'"
      width="min(560px, 94vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
      <el-form label-position="top" @submit.prevent="uploadAssets">
        <el-form-item label="Asset project">
          <el-select v-model="uploadProjectUid" style="width: 100%" :disabled="Boolean(uploadObjectId)">
            <el-option v-for="project in projects" :key="project.uid" :label="project.name" :value="project.uid" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="uploadObjectId" label="Object ID"><el-input :model-value="uploadObjectId" disabled /></el-form-item>
        <el-form-item label="Files (up to 20, 100 MiB each)">
          <input ref="fileInput" type="file" :multiple="!uploadObjectId" @change="selectFiles" />
        </el-form-item>
        <div v-if="busy && uploadProgress !== null" class="upload-progress" aria-live="polite">
          <span class="upload-progress-label">
            {{ uploadProgress < 1 ? "Preparing upload…" : uploadProgress < 100 ? "Uploading files…" : "Processing files…" }}
          </span>
          <el-progress :percentage="uploadProgress" :stroke-width="12" />
        </div>
      </el-form>
      <template #footer><el-button :disabled="busy" @click="uploadDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" :disabled="!uploadProjectUid || !uploadFiles.length || uploadFiles.length > 20"
          @click="uploadAssets">Upload</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.connection-banner { margin-bottom: 14px; }
.connection-banner :deep(.el-alert__description) { margin-top: 10px; }
.assets-tabs :deep(.el-tabs__header) { margin-bottom: 18px; }
.tab-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.version-value { font-family: var(--el-font-family-monospace, monospace); }
.fingerprint-value { font-family: var(--el-font-family-monospace, monospace); }
.latest-version-tag { margin-left: 10px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 18px; }
.upload-progress { margin-top: 4px; text-align: left; }
.upload-progress-label { display: block; margin-bottom: 8px; color: var(--el-text-color-regular); font-size: 14px; }
:global(.asset-actions-menu .el-dropdown-menu__item.asset-action-danger) {
  color: var(--el-color-danger);
}
:global(.asset-actions-menu .el-dropdown-menu__item.asset-action-danger:not(.is-disabled):hover),
:global(.asset-actions-menu .el-dropdown-menu__item.asset-action-danger:not(.is-disabled):focus) {
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
}
@media (max-width: 640px) {
  .tab-toolbar { align-items: stretch; flex-direction: column; }
  .pagination { justify-content: center; }
}
</style>
