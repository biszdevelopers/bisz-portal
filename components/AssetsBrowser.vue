<script setup lang="ts">
import {
  Delete,
  Download,
  EditPen,
  Link,
  MoreFilled,
  Upload,
  UploadFilled,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, type UploadUserFile } from "element-plus";
import type {
  AssetItem,
  AssetList,
  AssetVersion,
  AssetVersionList,
  UploadSession,
} from "~/composables/useAssetsApi";

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

const props = defineProps<{
  projectUid?: string | null;
  showProjectFilter?: boolean;
  showProjectColumn?: boolean;
  emptyText?: string;
  readonly?: boolean;
}>();

const route = useRoute();
const {
  assetBase,
  connection,
  projects,
  ensureConnection,
  acquireToken,
  assetsFetch,
  uploadFormData,
  refreshProjects,
  connectAssets,
} = useAssetsApi();

const fixedProjectUid = computed(() =>
  typeof props.projectUid === "string" && props.projectUid
    ? props.projectUid
    : null,
);
const unlinked = computed(() => props.projectUid === null);
const requestError = shallowRef<unknown>(null);
const page = ref(1);
const pageSize = 20;
const requestedProjectUid = Array.isArray(route.query.projectUid)
  ? route.query.projectUid[0]
  : route.query.projectUid;
const projectFilter = ref(
  fixedProjectUid.value ??
    (typeof requestedProjectUid === "string" ? requestedProjectUid : ""),
);
const showFilter = computed(
  () => props.showProjectFilter ?? !fixedProjectUid.value,
);
const showProjectColumn = computed(
  () => props.showProjectColumn ?? showFilter.value,
);
const assetData = ref<AssetList | null>(null);
const assetsPending = ref(false);
const assetsError = shallowRef<unknown>(null);
const busy = ref(false);
const connectDialogOpen = ref(false);
const renameDialog = ref(false);
const renamingAsset = ref<AssetItem | null>(null);
const renameValue = ref("");
const uploadDialog = ref(false);
const uploadProjectUid = ref("");
const uploadObjectId = ref("");
const uploadFileList = ref<UploadUserFile[]>([]);
const uploadFiles = computed(() =>
  uploadFileList.value.flatMap((file) => (file.raw ? [file.raw] : [])),
);
const uploadProgress = ref<number | null>(null);

const projectNames = computed(
  () => new Map(projects.value.map((project) => [project.uid, project.name])),
);
const assetRows = computed<AssetObjectRow[]>(() =>
  (assetData.value?.items ?? []).map((asset) => ({
    ...asset,
    rowKey: `asset:${asset.id}:${asset.version}`,
    rowType: "asset",
    hasChildren: true,
  })),
);
const emptyText = computed(() => props.emptyText ?? "No assets found");

watch(
  () => props.projectUid,
  (value) => {
    if (value === null) {
      projectFilter.value = "";
      assetData.value = null;
      assetsError.value = null;
      return;
    }
    if (typeof value === "string") projectFilter.value = value;
  },
);

watch(projectFilter, () => {
  if (page.value !== 1) page.value = 1;
  else void refreshAssets();
});
watch(page, () => {
  void refreshAssets();
});

onMounted(async () => {
  if (unlinked.value) return;
  await ensureConnection();
  const needsProjects = showFilter.value || showProjectColumn.value;
  await Promise.all([
    refreshAssets(),
    needsProjects ? refreshProjects() : Promise.resolve(),
  ]);
});

async function refreshAssets() {
  if (unlinked.value) return;
  assetsPending.value = true;
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize),
    });
    if (projectFilter.value) params.set("projectUid", projectFilter.value);
    assetData.value = await assetsFetch<AssetList>(`/?${params}`);
    assetsError.value = null;
  } catch (caught) {
    assetsError.value = caught;
  } finally {
    assetsPending.value = false;
  }
}

function reportError(caught: unknown, fallback: string) {
  requestError.value = caught;
  ElMessage.error(backendErrorMessage(caught, fallback));
}

function requireConnection() {
  if (connection.value.connected) return true;
  connectDialogOpen.value = true;
  return false;
}

function connect() {
  connectAssets();
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
    resolve(
      result.items.map((version) => ({
        ...version,
        rowKey: `version:${row.id}:${version.version}`,
        rowType: "version",
        asset: row,
      })),
    );
  } catch (caught) {
    resolve([]);
    reportError(caught, "The asset versions could not be loaded.");
  }
}

async function downloadAsset(asset: AssetItem, version: AssetVersion) {
  try {
    let token = connection.value.connected
      ? await acquireToken()
      : null;
    const assetPath = `/${encodeURIComponent(asset.id)}/${encodeURIComponent(version.version)}`;
    const download = (bearer: string | null) =>
      fetch(`${assetBase.value}${assetPath}`, {
        credentials: "omit",
        redirect: "error",
        cache: bearer ? "no-store" : "default",
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      });
    let response = await download(token);
    if (response.status === 401 && token) {
      if (connection.value.userId)
        clearAssetsBrowserToken(connection.value.userId);
      token = await acquireToken(true);
      response = await download(token);
    }
    if (response.status === 401 && token) {
      if (connection.value.userId)
        clearAssetsBrowserToken(connection.value.userId);
      connection.value.connected = false;
    }
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = version.originalFileName || asset.originalFileName || asset.id;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (caught) {
    reportError(caught, "The asset could not be downloaded.");
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function openRename(asset: AssetItem) {
  if (props.readonly) return;
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
      method: "PATCH",
      body: { originalFileName: renameValue.value },
    });
    requestError.value = null;
    renameDialog.value = false;
    await refreshAssets();
    ElMessage.success("Filename updated");
  } catch (caught) {
    reportError(caught, "The filename could not be updated.");
  } finally {
    busy.value = false;
  }
}

async function deleteAsset(asset: AssetItem) {
  if (props.readonly) return;
  if (!requireConnection()) return;
  const confirmed = await ElMessageBox.confirm(
    `Permanently delete ${asset.originalFileName || asset.id} and every version?`,
    "Delete asset",
    { type: "error", confirmButtonText: "Delete" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  try {
    await assetsFetch(`/assets/${encodeURIComponent(asset.id)}`, {
      method: "DELETE",
    });
    await refreshAssets();
    ElMessage.success("Asset deleted");
  } catch (caught) {
    reportError(caught, "The asset could not be deleted.");
  }
}

function openUpload(asset?: AssetItem) {
  if (props.readonly) return;
  if (!requireConnection()) return;
  uploadProjectUid.value =
    asset?.projectUid ?? fixedProjectUid.value ?? projectFilter.value;
  uploadObjectId.value = asset?.id ?? "";
  uploadFileList.value = [];
  uploadProgress.value = null;
  uploadDialog.value = true;
}

function handleUploadExceed() {
  ElMessage.warning(
    uploadObjectId.value
      ? "Select one file when uploading a new version"
      : "Select at most 20 files",
  );
}

async function uploadAssets() {
  if (!uploadProjectUid.value || !uploadFiles.value.length) return;
  if (
    uploadFiles.value.length > 20 ||
    uploadFiles.value.some((file) => file.size > 100 * 1024 * 1024)
  ) {
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
      method: "POST",
      body: { projectUid: uploadProjectUid.value },
    });
    sessionToken = session.sessionToken;
    const formData = new FormData();
    formData.set(
      "manifest",
      JSON.stringify({
        files: uploadFiles.value.map((_, index) => ({
          fieldName: `file${index}`,
          ...(uploadObjectId.value ? { objectId: uploadObjectId.value } : {}),
        })),
      }),
    );
    uploadFiles.value.forEach((file, index) =>
      formData.append(`file${index}`, file),
    );
    await uploadFormData("/assets", formData, sessionToken, (progress) => {
      uploadProgress.value = progress;
    });
    requestError.value = null;
    uploadDialog.value = false;
    await refreshAssets();
    ElMessage.success("Files uploaded");
  } catch (caught) {
    reportError(caught, "The files could not be uploaded.");
  } finally {
    if (sessionToken) {
      void assetsFetch("/sessions", {
        method: "DELETE",
        sessionToken,
      }).catch(() => {});
    }
    busy.value = false;
    uploadProgress.value = null;
  }
}
</script>

<template>
  <section class="assets-browser">
    <BackendErrorDetails
      v-if="requestError || assetsError"
      :error="requestError || assetsError"
    />

    <el-alert
      v-if="!connection.connected && !unlinked"
      class="connection-banner"
      type="info"
      :closable="false"
      title="Browse public assets. Connect to DevConnect Assets to manage them."
    >
      <el-button
        size="small"
        type="primary"
        @click="connectDialogOpen = true"
      >
        {{ connection.portalSignedIn ? "Connect Assets" : "Sign in to manage" }}
      </el-button>
    </el-alert>

    <div v-if="!unlinked" class="assets-browser__toolbar">
      <el-select
        v-if="showFilter"
        v-model="projectFilter"
        placeholder="All projects"
        clearable
        style="width: min(280px, 100%)"
      >
        <el-option
          v-for="project in projects"
          :key="project.uid"
          :label="project.name"
          :value="project.uid"
        />
      </el-select>
      <span v-else />
      <el-button v-if="!readonly" type="primary" :icon="Upload" @click="openUpload()">
        Upload files
      </el-button>
    </div>

    <el-empty
      v-if="unlinked"
      :image-size="84"
      description="This project has no Assets project linked."
    />

    <el-card v-else shadow="never" v-loading="assetsPending">
      <el-table
        :data="assetRows"
        row-key="rowKey"
        lazy
        :load="loadAssetVersions"
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        :empty-text="emptyText"
      >
        <el-table-column label="File" min-width="220">
          <template #default="{ row }">
            <template v-if="(row as AssetTableRow).rowType === 'asset'">
              {{ (row as AssetObjectRow).originalFileName || (row as AssetObjectRow).id }}
            </template>
            <template v-else>
              <el-link
                :underline="false"
                :href="assetBase + '/' + (row as AssetVersionRow).asset.id + '/' + (row as AssetVersionRow).version"
                target="_blank"
              >
                <span class="version-value">Version {{ (row as AssetVersionRow).version }}</span>
                <el-icon class="ml-2"><Link /></el-icon>
              </el-link>
              <el-tag
                v-if="(row as AssetVersionRow).version === (row as AssetVersionRow).asset.version"
                class="latest-version-tag"
                size="small"
                type="success"
              >
                Latest
              </el-tag>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="Object ID" min-width="220">
          <template #default="{ row }">
            <el-tooltip
              v-if="(row as AssetTableRow).rowType === 'asset' && !readonly"
              placement="right"
            >
              <template #content>
                <pre>{{ (row as AssetObjectRow).id }}</pre>
              </template>
              <el-link
                :underline="false"
                :href="assetBase + '/' + (row as AssetObjectRow).id"
                target="_blank"
              >
                {{ (row as AssetObjectRow).id.length > 16
                  ? (row as AssetObjectRow).id.slice(0, 16) + '…'
                  : (row as AssetObjectRow).id }}
                <el-icon class="ml-2"><Link /></el-icon>
              </el-link>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column v-if="showProjectColumn" label="Project" min-width="170">
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
            <el-tooltip
              v-if="(row as AssetTableRow).rowType === 'version'"
              placement="top"
            >
              <template #content>
                <pre>{{ (row as AssetVersionRow).sha256 }}</pre>
              </template>
              <span class="fingerprint-value">{{ (row as AssetVersionRow).sha256.slice(0, 16) }}…</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="100" fixed="right" align="right">
          <template #default="{ row }">
            <el-dropdown
              v-if="(row as AssetTableRow).rowType === 'asset'"
              trigger="click"
              placement="bottom-end"
              popper-class="asset-actions-menu"
            >
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
                  <el-dropdown-item
                    divided
                    class="asset-action-danger"
                    @click="deleteAsset(row as AssetObjectRow)"
                  >
                    <template #icon><Delete /></template>
                    Delete
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown
              v-else
              trigger="click"
              placement="bottom-end"
              popper-class="asset-actions-menu"
            >
              <el-button text :icon="MoreFilled" aria-label="Version actions" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    @click="downloadAsset((row as AssetVersionRow).asset, row as AssetVersionRow)"
                  >
                    <template #icon><Download /></template>
                    Download
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div class="assets-browser__pagination">
        <el-pagination
          v-model:current-page="page"
          background
          layout="prev, pager, next"
          :page-size="pageSize"
          :total="assetData?.total ?? 0"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="connectDialogOpen"
      title="Connect to DevConnect Assets"
      width="min(480px, 94vw)"
    >
      <p>
        {{ connection.portalSignedIn
          ? "Sign in to the Assets application to manage files and projects."
          : "Sign in to the portal first, then connect to the Assets application." }}
      </p>
      <template #footer>
        <el-button @click="connectDialogOpen = false">Cancel</el-button>
        <el-button type="primary" @click="connect">
          {{ connection.portalSignedIn ? "Connect Assets" : "Sign in" }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="renameDialog"
      title="Rename file"
      width="min(480px, 94vw)"
    >
      <el-form label-position="top" @submit.prevent="renameAsset">
        <el-form-item label="Displayed filename">
          <el-input v-model="renameValue" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" @click="renameAsset">
          Save
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="uploadDialog"
      :title="uploadObjectId ? 'Upload new version' : 'Upload files'"
      width="min(560px, 94vw)"
      :close-on-click-modal="!busy"
      :close-on-press-escape="!busy"
      :show-close="!busy"
    >
      <el-form label-position="top" @submit.prevent="uploadAssets">
        <el-form-item v-if="!fixedProjectUid" label="Asset project">
          <el-select
            v-model="uploadProjectUid"
            style="width: 100%"
            :disabled="Boolean(uploadObjectId)"
          >
            <el-option
              v-for="project in projects"
              :key="project.uid"
              :label="project.name"
              :value="project.uid"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="uploadObjectId" label="Object ID">
          <el-input :model-value="uploadObjectId" disabled />
        </el-form-item>
        <el-form-item label="Files (up to 20, 100 MiB each)">
          <el-upload
            v-model:file-list="uploadFileList"
            class="upload-area"
            drag
            :auto-upload="false"
            :multiple="!uploadObjectId"
            :limit="uploadObjectId ? 1 : 20"
            :disabled="busy"
            :on-exceed="handleUploadExceed"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">
              Drop files here or <em>click to upload</em>
            </div>
          </el-upload>
        </el-form-item>
        <div
          v-if="busy && uploadProgress !== null"
          class="upload-progress"
          aria-live="polite"
        >
          <span class="upload-progress-label">
            {{ uploadProgress < 1
              ? "Preparing upload…"
              : uploadProgress < 100
                ? "Uploading files…"
                : "Processing files…" }}
          </span>
          <el-progress :percentage="uploadProgress" :stroke-width="12" />
        </div>
      </el-form>
      <template #footer>
        <el-button :disabled="busy" @click="uploadDialog = false">
          Cancel
        </el-button>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="!uploadProjectUid || !uploadFiles.length || uploadFiles.length > 20"
          @click="uploadAssets"
        >
          Upload
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
.assets-browser__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.version-value,
.fingerprint-value {
  font-family: var(--el-font-family-monospace, monospace);
}
.latest-version-tag {
  margin-left: 10px;
}
.assets-browser__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}
.upload-area {
  width: 100%;
}
.upload-area :deep(.el-upload) {
  width: 100%;
}
.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  padding: 28px 16px;
}
.upload-progress {
  margin-top: 4px;
  text-align: left;
}
.upload-progress-label {
  display: block;
  margin-bottom: 8px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}
:global(.asset-actions-menu .el-dropdown-menu__item.asset-action-danger) {
  color: var(--el-color-danger);
}
:global(.asset-actions-menu .el-dropdown-menu__item.asset-action-danger:not(.is-disabled):hover),
:global(.asset-actions-menu .el-dropdown-menu__item.asset-action-danger:not(.is-disabled):focus) {
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
}
@media (max-width: 640px) {
  .assets-browser__toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .assets-browser__pagination {
    justify-content: center;
  }
}
</style>
