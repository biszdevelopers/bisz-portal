<script setup lang="ts">
import {
  Calendar,
  Collection,
  Connection,
  DocumentChecked,
  FolderAdd,
  FolderOpened,
  Grid,
  PriceTag,
  Search,
  Setting,
  User,
  WarningFilled,
} from "@element-plus/icons-vue";
import type { SearchResponse, SearchResult } from "~/shared/contracts";
import { useViewport } from "~/composables/useViewport";
import { useCommandPalette } from "~/composables/useCommandPalette";

type PaletteItem =
  | { kind: "result"; result: SearchResult }
  | { kind: "action"; title: string; subtitle: string; icon: unknown; url?: string; run?: () => void };

const RECENT_KEY = "bisz-portal-recent";

const { visible, close } = useCommandPalette();
const { isMobile } = useViewport();
const query = ref("");
const loading = ref(false);
const results = ref<SearchResult[]>([]);
const activeIndex = ref(0);
const input = ref<{ focus: () => void }>();
const recent = ref<Array<{ title: string; subtitle: string; url: string }>>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;

const actions: PaletteItem[] = [
  { kind: "action", title: "Overview", subtitle: "Go to overview", icon: Grid, url: "/" },
  { kind: "action", title: "Tasks", subtitle: "Go to tasks", icon: DocumentChecked, url: "/tasks" },
  { kind: "action", title: "Projects", subtitle: "Go to projects", icon: FolderOpened, url: "/projects" },
  { kind: "action", title: "Incidents", subtitle: "Go to incidents", icon: WarningFilled, url: "/incidents" },
  { kind: "action", title: "Calendar", subtitle: "Go to calendar", icon: Calendar, url: "/calendar" },
  { kind: "action", title: "Assets", subtitle: "Go to assets", icon: Collection, url: "/assets" },
  { kind: "action", title: "Users", subtitle: "Browse users", icon: User, url: "/users" },
  { kind: "action", title: "Applications", subtitle: "Manage applications", icon: Connection, url: "/applications" },
  { kind: "action", title: "Tags", subtitle: "Manage tags", icon: PriceTag, url: "/tags" },
  { kind: "action", title: "Settings", subtitle: "Account and notifications", icon: Setting, url: "/settings" },
  { kind: "action", title: "New project", subtitle: "Create a project", icon: FolderAdd, url: "/projects/new" },
];

const items = computed<PaletteItem[]>(() => {
  if (query.value.trim()) {
    return results.value.map((result) => ({ kind: "result", result }));
  }
  return [
    ...recent.value.map(
      (item): PaletteItem => ({
        kind: "action",
        title: item.title,
        subtitle: item.subtitle,
        icon: Search,
        url: item.url,
      }),
    ),
    ...actions,
  ];
});

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as typeof recent.value) : [];
    recent.value = parsed
      .filter(
        (entry) =>
          typeof entry?.url === "string" &&
          entry.url.startsWith("/") &&
          !entry.url.startsWith("//"),
      )
      .slice(0, 6);
  } catch {
    recent.value = [];
  }
}

function remember(item: SearchResult) {
  const next = [
    { title: item.title, subtitle: item.subtitle, url: item.url },
    ...recent.value.filter((entry) => entry.url !== item.url),
  ].slice(0, 6);
  recent.value = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent items are a convenience.
  }
}

async function search(value: string) {
  controller?.abort();
  if (!value.trim()) {
    results.value = [];
    activeIndex.value = 0;
    return;
  }
  controller = new AbortController();
  loading.value = true;
  try {
    const response = await $fetch<SearchResponse>("/api/search", {
      query: { q: value.trim(), limit: 5 },
      signal: controller.signal,
    });
    results.value = response.results;
    activeIndex.value = 0;
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      results.value = [];
    }
  } finally {
    loading.value = false;
  }
}

watch(query, (value) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void search(value), 220);
});

watch(visible, async (value) => {
  if (!value) return;
  loadRecent();
  query.value = "";
  results.value = [];
  activeIndex.value = 0;
  await nextTick();
  input.value?.focus();
});

async function select(item: PaletteItem) {
  if (item.kind === "result") {
    remember(item.result);
    close();
    await navigateTo(item.result.url);
    return;
  }
  if (item.run) {
    close();
    item.run();
    return;
  }
  if (item.url) {
    close();
    await navigateTo(item.url);
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!visible.value) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, items.value.length - 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const item = items.value[activeIndex.value];
    if (item) void select(item);
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    visible.value = !visible.value;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onGlobalKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  if (timer) clearTimeout(timer);
  controller?.abort();
});
</script>

<template>
  <el-dialog
    v-model="visible"
    :fullscreen="isMobile"
    :show-close="false"
    class="command-palette"
    width="min(680px, 92vw)"
    top="10vh"
    append-to-body
    @closed="query = ''"
  >
    <template #header>
      <div class="command-palette__search">
        <el-icon><Search /></el-icon>
        <input
          ref="input"
          v-model="query"
          type="search"
          placeholder="Search projects, tasks, incidents, users, or jump to a page"
          aria-label="Search the workspace"
          autocomplete="off"
          @keydown="onKeydown"
        />
        <kbd class="command-palette__kbd">Esc</kbd>
      </div>
    </template>
    <div v-loading="loading" class="command-palette__body">
      <p v-if="!query && recent.length" class="command-palette__label">Recent</p>
      <p v-else-if="!query" class="command-palette__label">Jump to</p>
      <p v-else-if="results.length" class="command-palette__label">Results</p>
      <p v-else-if="!loading" class="command-palette__empty">
        No matches for “{{ query }}”.
      </p>
      <button
        v-for="(item, index) in items"
        :key="item.kind === 'result' ? `${item.result.type}:${item.result.id}` : item.title"
        type="button"
        class="command-palette__item"
        :class="{ 'is-active': index === activeIndex }"
        @mouseenter="activeIndex = index"
        @click="select(item)"
      >
        <span class="command-palette__icon">
          <el-icon>
            <component
              :is="item.kind === 'result' ? (item.result.type === 'project' ? FolderOpened : item.result.type === 'task' ? DocumentChecked : item.result.type === 'incident' ? WarningFilled : User) : item.icon"
            />
          </el-icon>
        </span>
        <span class="command-palette__text">
          <strong>{{ item.kind === "result" ? item.result.title : item.title }}</strong>
          <small>{{ item.kind === "result" ? item.result.subtitle : item.subtitle }}</small>
        </span>
        <kbd v-if="index === activeIndex" class="command-palette__kbd">↵</kbd>
      </button>
    </div>
    <template #footer>
      <span class="command-palette__hint">
        <kbd class="command-palette__kbd">↑</kbd>
        <kbd class="command-palette__kbd">↓</kbd> navigate
        <kbd class="command-palette__kbd">↵</kbd> open
        <kbd class="command-palette__kbd">Ctrl K</kbd> toggle
      </span>
    </template>
  </el-dialog>
</template>

<style scoped>
.command-palette__search {
  display: flex;
  align-items: center;
  gap: 10px;
}

.command-palette__search input {
  flex: 1;
  min-width: 0;
  padding: 6px 0;
  color: var(--text-primary);
  font: inherit;
  font-size: 16px;
  background: transparent;
  border: 0;
  outline: none;
}

.command-palette__body {
  display: grid;
  gap: 2px;
  min-height: 120px;
  max-height: 60vh;
  overflow-y: auto;
}

.command-palette__label {
  margin: 6px 8px 2px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.command-palette__empty {
  margin: 24px 8px;
  color: var(--text-muted);
  text-align: center;
}

.command-palette__item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  color: var(--text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.command-palette__item.is-active {
  background: var(--surface-subtle);
}

.command-palette__icon {
  display: grid;
  width: 30px;
  height: 30px;
  color: var(--accent);
  background: var(--el-color-primary-light-9);
  border-radius: var(--radius-sm);
  place-items: center;
}

.command-palette__text {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.command-palette__text strong,
.command-palette__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette__text strong {
  font-size: 13px;
  font-weight: 600;
}

.command-palette__text small {
  color: var(--text-muted);
  font-size: 11px;
}

.command-palette__kbd {
  padding: 2px 6px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
}

.command-palette__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
}
</style>
