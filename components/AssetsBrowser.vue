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

const previewOpen = ref(false);
const previewTitle = ref("");
const previewKind = ref<"image" | "pdf" | "text" | "audio" | "video" | null>(null);
const previewUrl = ref("");
const previewText = ref("");
const previewLoading = ref(false);
const previewError = ref("");
const versionsOpen = ref(false);
const versionsAsset = ref<AssetItem | null>(null);
const versions = ref<AssetVersion[]>([]);
const versionsLoading = ref(false);

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}

async function fetchAssetBlob(asset: AssetItem, version: AssetVersion) {
  let token = connection.value.connected ? await acquireToken() : null;
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
    if (connection.value.userId) clearAssetsBrowserToken(connection.value.userId);
    token = await acquireToken(true);
    response = await download(token);
  }
  if (!response.ok) throw new Error(`Preview failed (${response.status})`);
  return await response.blob();
}

async function previewAsset(asset: AssetItem, version: AssetVersion) {
  revokePreview();
  previewTitle.value = version.originalFileName || asset.originalFileName || asset.id;
  previewKind.value = null;
  previewText.value = "";
  previewError.value = "";
  previewOpen.value = true;
  const mime = (version.mimeType || "").toLowerCase();
  if (mime === "image/svg+xml") {
    previewError.value = "SVG files are downloaded instead of previewed.";
    return;
  }
  if (version.sizeBytes > 25 * 1024 * 1024) {
    previewError.value = "This file is too large to preview. Download it instead.";
    return;
  }
  previewLoading.value = true;
  try {
    const blob = await fetchAssetBlob(asset, version);
    if (mime.startsWith("image/")) {
      previewKind.value = "image";
      previewUrl.value = URL.createObjectURL(blob);
    } else if (mime === "application/pdf") {
      previewKind.value = "pdf";
      previewUrl.value = URL.createObjectURL(blob);
    } else if (mime.startsWith("text/") || mime === "application/json") {
      if (blob.size > 2 * 1024 * 1024) {
        previewError.value = "This text file is too large to preview.";
        return;
      }
      previewKind.value = "text";
      previewText.value = await blob.text();
    } else if (mime.startsWith("audio/")) {
      previewKind.value = "audio";
      previewUrl.value = URL.createObjectURL(blob);
    } else if (mime.startsWith("video/")) {
      previewKind.value = "video";
      previewUrl.value = URL.createObjectURL(blob);
    } else {
      previewError.value = "This file type cannot be previewed. Download it instead.";
    }
  } catch (caught) {
    previewError.value = backendErrorMessage(caught, "The file could not be previewed.");
  } finally {
    previewLoading.value = false;
  }
}

function closePreview() {
  revokePreview();
  previewKind.value = null;
  previewText.value = "";
  previewError.value = "";
}

async function openVersions(asset: AssetItem) {
  versionsAsset.value = asset;
  versionsOpen.value = true;
  versionsLoading.value = true;
  versions.value = [];
  try {
    const result = await assetsFetch<AssetVersionList>(
      `/assets/${encodeURIComponent(asset.id)}/versions`,
    );
    versions.value = result.items;
  } catch (caught) {
    reportError(caught, "The asset versions could not be loaded.");
  } finally {
    versionsLoading.value = false;
  }
}

onBeforeUnmount(revokePreview);

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
        class="desktop-table"
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
                  <el-dropdown-item @click="previewAsset(row as AssetObjectRow, row as AssetObjectRow)">
                    Preview latest
                  </el-dropdown-item>
                  <el-dropdown-item @click="openVersions(row as AssetObjectRow)">
                    Version history
                  </el-dropdown-item>
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
                    @click="previewAsset((row as AssetVersionRow).asset, row as AssetVersionRow)"
                  >
                    Preview
                  </el-dropdown-item>
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

      <div class="assets-mobile mobile-card-list">
        <article v-for="asset in assetRows" :key="asset.id" class="asset-card surface">
          <div class="asset-card__main">
            <strong>{{ asset.originalFileName || asset.id }}</strong>
            <small>{{ formatSize(asset.sizeBytes) }} · {{ projectNames.get(asset.projectUid) || "Assets" }}</small>
          </div>
          <div class="asset-card__actions">
            <el-button text size="small" @click="previewAsset(asset, asset)">Preview</el-button>
            <el-dropdown
              v-if="!readonly"
              trigger="click"
              placement="bottom-end"
              popper-class="asset-actions-menu"
            >
              <el-button text :icon="MoreFilled" aria-label="Object actions" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openVersions(asset)">Version history</el-dropdown-item>
                  <el-dropdown-item @click="openUpload(asset)">Upload new version</el-dropdown-item>
                  <el-dropdown-item @click="openRename(asset)">Rename</el-dropdown-item>
                  <el-dropdown-item divided class="asset-action-danger" @click="deleteAsset(asset)">
                    Delete
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </article>
        <el-empty v-if="!assetRows.length && !assetsPending" :image-size="72" :description="emptyText" />
      </div>

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

    <el-dialog
      v-model="previewOpen"
      :title="previewTitle || 'Preview'"
      width="min(880px, 94vw)"
      @closed="closePreview"
    >
      <div v-loading="previewLoading" class="asset-preview">
        <p v-if="previewError" class="asset-preview__error">{{ previewError }}</p>
        <img v-else-if="previewKind === 'image'" :src="previewUrl" :alt="previewTitle" />
        <iframe
          v-else-if="previewKind === 'pdf'"
          :src="previewUrl"
          class="asset-preview__frame"
          title="PDF preview"
          sandbox=""
        />
        <pre v-else-if="previewKind === 'text'" class="asset-preview__text">{{ previewText }}</pre>
        <audio v-else-if="previewKind === 'audio'" :src="previewUrl" controls />
        <video v-else-if="previewKind === 'video'" :src="previewUrl" controls />
      </div>
      <template #footer>
        <el-button @click="previewOpen = false">Close</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="versionsOpen"
      :title="versionsAsset ? `Versions of ${versionsAsset.originalFileName || versionsAsset.id}` : 'Versions'"
      width="min(680px, 94vw)"
    >
      <div v-loading="versionsLoading" class="version-list">
        <div v-for="version in versions" :key="version.version" class="version-row surface">
          <span>
            <strong>Version {{ version.version }}</strong>
            <small>{{ formatSize(version.sizeBytes) }} · {{ version.mimeType }}</small>
          </span>
          <div>
            <el-button
              v-if="versionsAsset"
              text
              size="small"
              @click="previewAsset(versionsAsset, version)"
              >Preview</el-button
            >
            <el-button
              v-if="versionsAsset"
              text
              size="small"
              @click="downloadAsset(versionsAsset, version)"
              >Download</el-button
            >
          </div>
        </div>
        <el-empty v-if="!versions.length && !versionsLoading" :image-size="72" description="No versions found." />
      </div>
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
.asset-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
}

.asset-card__main {
  display: grid;
  min-width: 0;
}

.asset-card__main strong,
.asset-card__main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card__main small {
  color: var(--text-muted);
  font-size: 11px;
}

.asset-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.asset-preview {
  display: grid;
  min-height: 180px;
  place-items: center;
}

.asset-preview img,
.asset-preview video {
  max-width: 100%;
  max-height: 70vh;
  border-radius: var(--radius-sm);
}

.asset-preview__frame {
  width: 100%;
  height: 70vh;
  border: 0;
}

.asset-preview__text {
  width: 100%;
  max-height: 70vh;
  margin: 0;
  overflow: auto;
  padding: 16px;
  font: 12px/1.6 var(--font-mono);
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--surface-subtle);
  border-radius: var(--radius-sm);
}

.asset-preview__error {
  color: var(--status-danger);
  font-size: 13px;
}

.version-list {
  display: grid;
  gap: 6px;
}

.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
}

.version-row span {
  display: grid;
}

.version-row small {
  color: var(--text-muted);
  font-size: 11px;
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
