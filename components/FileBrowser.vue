<script setup lang="ts">
import { Document, Folder, Link } from "@element-plus/icons-vue";
import type { ProjectFileEntry } from "~/shared/contracts";

const props = withDefaults(
  defineProps<{
    path: string;
    entries: ProjectFileEntry[];
    loading?: boolean;
    rootLabel?: string;
    objectBaseUrl?: string;
  }>(),
  { loading: false, rootLabel: "Files" },
);

const emit = defineEmits<{ navigate: [path: string] }>();

const breadcrumbs = computed(() => {
  const parts = props.path.split("/").filter(Boolean);
  return [
    { label: props.rootLabel, path: "/" },
    ...parts.map((part, index) => ({
      label: part,
      path: `/${parts.slice(0, index + 1).join("/")}`,
    })),
  ];
});

const sortedEntries = computed(() => {
  const parent: ProjectFileEntry[] =
    props.path === "/"
      ? []
      : [{ name: "..", type: "directory", objectId: "__parent__" }];
  return [...parent, ...props.entries].sort((left, right) => {
    if (left.name === "..") return -1;
    if (right.name === "..") return 1;
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
});

function parentPath() {
  const parts = props.path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

function entryPath(entry: ProjectFileEntry) {
  return props.path === "/"
    ? `/${entry.name}`
    : `${props.path.replace(/\/$/, "")}/${entry.name}`;
}

function objectUrl(entry: ProjectFileEntry) {
  if (entry.name === ".." || !props.objectBaseUrl) return "";
  return `${props.objectBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(entry.objectId)}`;
}

function abbreviatedObjectId(entry: ProjectFileEntry) {
  if (entry.name === "..") return "";
  return entry.objectId.length > 16
    ? `${entry.objectId.slice(0, 16)}…`
    : entry.objectId;
}

function openEntry(entry: ProjectFileEntry) {
  if (entry.type === "directory") {
    emit("navigate", entry.name === ".." ? parentPath() : entryPath(entry));
    return;
  }
  const url = objectUrl(entry);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

function fileEntry(row: unknown) {
  return row as ProjectFileEntry;
}
</script>

<template>
  <div class="file-browser" v-loading="loading">
    <div class="file-browser__path">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item
          v-for="(crumb, index) in breadcrumbs"
          :key="crumb.path"
        >
          <button
            v-if="index < breadcrumbs.length - 1"
            class="file-browser__crumb"
            type="button"
            @click="emit('navigate', crumb.path)"
          >
            {{ crumb.label }}
          </button>
          <span v-else>{{ crumb.label }}</span>
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <el-table
      :data="sortedEntries"
      empty-text="This directory is empty"
      row-key="objectId"
      @row-click="openEntry"
    >
      <el-table-column label="Name" min-width="280">
        <template #default="{ row }">
          <div
            class="file-browser__name"
            :class="{ 'is-directory': row.type === 'directory' }"
          >
            <el-icon>
              <Folder v-if="row.type === 'directory'" />
              <Document v-else />
            </el-icon>
            <button
              v-if="row.type === 'directory'"
              type="button"
              @click.stop="openEntry(fileEntry(row))"
            >
              {{ row.name }}
            </button>
            <a
              v-else
              class="file-browser__file-link"
              :href="objectUrl(fileEntry(row))"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
            >
              {{ row.name }}
            </a>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="Object ID" min-width="220">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.name !== '..'"
            placement="right"
            :content="row.objectId"
          >
            <a
              class="file-browser__object-link"
              :href="objectUrl(fileEntry(row))"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
            >
              <span>{{ abbreviatedObjectId(fileEntry(row)) }}</span>
              <el-icon><Link /></el-icon>
            </a>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="type" label="Type" width="130" />
    </el-table>
  </div>
</template>

<style scoped>
.file-browser {
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}
.file-browser__path {
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
}
.file-browser__crumb,
.file-browser__name button {
  padding: 0;
  border: 0;
  color: var(--el-text-color-primary);
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.file-browser__crumb:hover,
.file-browser__name button:hover,
.file-browser__file-link:hover,
.file-browser__object-link:hover {
  color: var(--el-color-primary);
}
.file-browser__file-link,
.file-browser__object-link {
  color: var(--el-text-color-primary);
  text-decoration: none;
}
.file-browser__object-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(
    --el-font-family-monospace,
    ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace
  );
}
.file-browser__name {
  display: flex;
  align-items: center;
  gap: 10px;
}
.file-browser__name .el-icon {
  color: var(--el-text-color-secondary);
  font-size: 18px;
}
.file-browser__name.is-directory .el-icon {
  color: var(--el-text-color-secondary);
}
.file-browser__name.is-directory:hover .el-icon {
  color: var(--el-color-primary);
}
.file-browser :deep(.el-table__row:has(.is-directory)) {
  cursor: pointer;
}
</style>
