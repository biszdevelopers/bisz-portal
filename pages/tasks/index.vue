<script setup lang="ts">
import { Delete, Download, Plus, Search } from "@element-plus/icons-vue";
import type { TaskBulkResult, TaskView, UserSummary } from "~/shared/contracts";
import {
  formatTaskDueDate,
  markdownExcerpt,
  taskDateHeading,
  taskStatusLabel,
} from "~/utils/tasks";

const route = useRoute();
const router = useRouter();
const { capabilities, data: access, pending: accessPending, error: accessError } =
  usePortalAccess();

const tasks = shallowRef<TaskView[]>([]);
const loading = ref(false);
const loadError = shallowRef<unknown>(null);
const nextCursor = ref<string | null>(null);
const selected = ref<string[]>([]);
const projects = ref<Array<{ id: string; name: string }>>([]);
const exportUrl = ref("");

const searchInput = ref(typeof route.query.q === "string" ? route.query.q : "");
const status = ref(
  typeof route.query.status === "string" ? route.query.status : "all",
);
const projectId = ref(
  typeof route.query.projectId === "string" ? route.query.projectId : "",
);
const due = ref(typeof route.query.due === "string" ? route.query.due : "");
const mine = ref(route.query.mine !== "false");
const tag = ref(typeof route.query.tag === "string" ? route.query.tag : "");
const assignee = ref<UserSummary[]>([]);
const sort = ref<"due" | "created">("due");
const bulkAction = ref<"status" | "assign" | "add-tag" | "remove-tag">("status");
const bulkStatus = ref<"todo" | "done">("done");
const bulkUsers = ref<UserSummary[]>([]);
const bulkTags = ref<string[]>([]);
const bulkBusy = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const query = computed(() => {
  const result: Record<string, unknown> = { limit: 200 };
  if (searchInput.value.trim()) result.q = searchInput.value.trim();
  if (status.value !== "all") result.status = status.value;
  if (projectId.value) result.projectId = projectId.value;
  if (due.value) result.due = due.value;
  if (tag.value) result.tag = tag.value;
  if (assignee.value[0]) result.assigneeId = assignee.value[0].id;
  if (mine.value) result.mine = true;
  return result;
});
const savedQuery = computed(() =>
  Object.fromEntries(
    Object.entries({
      q: searchInput.value.trim(),
      status: status.value === "all" ? "" : status.value,
      projectId: projectId.value,
      due: due.value,
      tag: tag.value,
      assigneeId: assignee.value[0]?.id ?? "",
      mine: String(mine.value),
    }).filter(([, value]) => value && value !== "false"),
  ),
);

const filteredGroups = computed(() => {
  const sorted = [...tasks.value].sort((left, right) => {
    if (sort.value === "created")
      return right.createdAt.localeCompare(left.createdAt);
    if (!left.dueDate && !right.dueDate)
      return right.createdAt.localeCompare(left.createdAt);
    if (!left.dueDate) return 1;
    if (!right.dueDate) return -1;
    return (
      left.dueDate.localeCompare(right.dueDate) ||
      right.createdAt.localeCompare(left.createdAt)
    );
  });
  const groups = new Map<string, TaskView[]>();
  for (const task of sorted) {
    const key = task.dueDate ?? "undated";
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }
  return [...groups].map(([date, groupTasks]) => ({
    date,
    label: taskDateHeading(date),
    tasks: groupTasks,
  }));
});

const allVisibleSelected = computed(
  () =>
    tasks.value.length > 0 &&
    tasks.value.every((task) => selected.value.includes(task.id)),
);

function syncUrl() {
  const next: Record<string, string> = {};
  if (searchInput.value.trim()) next.q = searchInput.value.trim();
  if (status.value !== "all") next.status = status.value;
  if (projectId.value) next.projectId = projectId.value;
  if (due.value) next.due = due.value;
  if (tag.value) next.tag = tag.value;
  if (assignee.value[0]) next.assigneeId = assignee.value[0].id;
  if (!mine.value) next.mine = "false";
  void router.replace({ query: next });
}

async function fetchTasks(reset = true) {
  loading.value = true;
  loadError.value = null;
  try {
    const response = await $fetch<{
      tasks: TaskView[];
      nextCursor: string | null;
    }>("/api/tasks", {
      query: {
        ...query.value,
        ...(!reset && nextCursor.value ? { cursor: nextCursor.value } : {}),
      },
    });
    tasks.value = reset ? response.tasks : [...tasks.value, ...response.tasks];
    nextCursor.value = response.nextCursor;
    if (reset) selected.value = [];
    syncUrl();
  } catch (caught) {
    loadError.value = caught;
  } finally {
    loading.value = false;
  }
}

async function loadProjects() {
  try {
    const response = await $fetch<{ projects: Array<{ id: string; name: string }> }>(
      "/api/projects",
    );
    projects.value = response.projects;
  } catch {
    projects.value = [];
  }
}

function toggleAll() {
  selected.value = allVisibleSelected.value
    ? []
    : tasks.value.map((task) => task.id);
}

function toggleTask(taskId: string) {
  selected.value = selected.value.includes(taskId)
    ? selected.value.filter((id) => id !== taskId)
    : [...selected.value, taskId];
}

async function applySavedFilter(value: Record<string, unknown>) {
  searchInput.value = String(value.q ?? "");
  status.value = String(value.status || "all");
  projectId.value = String(value.projectId ?? "");
  due.value = String(value.due ?? "");
  tag.value = String(value.tag ?? "");
  mine.value = value.mine !== "false";
  const assigneeId = String(value.assigneeId ?? "");
  if (!assigneeId) {
    assignee.value = [];
    return;
  }
  try {
    const response = await $fetch<{
      user: { id: string; displayName: string | null; email: string; image: string | null };
    }>(`/api/users/${encodeURIComponent(assigneeId)}`);
    assignee.value = [
      {
        id: response.user.id,
        displayName: response.user.displayName || response.user.email,
        email: response.user.email,
        image: response.user.image,
      },
    ];
  } catch {
    assignee.value = [];
  }
}

async function applyBulk() {
  if (!selected.value.length || bulkBusy.value) return;
  const body = (() => {
    if (bulkAction.value === "status")
      return { taskIds: selected.value, action: "status", value: bulkStatus.value };
    if (bulkAction.value === "assign") {
      if (!bulkUsers.value[0]) return null;
      return { taskIds: selected.value, action: "assign", value: bulkUsers.value[0].id };
    }
    if (!bulkTags.value[0]) return null;
    return {
      taskIds: selected.value,
      action: bulkAction.value,
      value: bulkTags.value[0],
    };
  })();
  if (!body) return;
  bulkBusy.value = true;
  try {
    const result = await $fetch<TaskBulkResult>("/api/tasks/bulk", {
      method: "PATCH",
      body,
    });
    const skipped = result.skipped.length;
    ElMessage.success(
      `${result.updated.length} task${result.updated.length === 1 ? "" : "s"} updated${skipped ? ` · ${skipped} skipped` : ""}`,
    );
    if (skipped) {
      ElMessage.warning(
        result.skipped
          .slice(0, 3)
          .map((entry) => entry.reason)
          .join("; "),
      );
    }
    await fetchTasks(true);
    bulkUsers.value = [];
    bulkTags.value = [];
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "Bulk update failed."));
  } finally {
    bulkBusy.value = false;
  }
}

function updateExportUrl() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query.value)) {
    if (key !== "limit" && typeof value === "string") params.set(key, value);
    if (key === "mine" && value) params.set("mine", "true");
  }
  exportUrl.value = `/api/tasks/export.csv?${params.toString()}`;
}

watch(searchInput, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void fetchTasks(true), 300);
});
watch([status, projectId, due, tag, mine, assignee], () => void fetchTasks(true));
watch(query, updateExportUrl, { immediate: true });

onMounted(async () => {
  await Promise.all([fetchTasks(true), loadProjects()]);
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

useHead({ title: "Tasks · DevConnect" });
</script>

<template>
  <section class="page tasks-page">
    <PageHeader
      title="Tasks"
      description="Review work across the projects you can access."
    >
      <template #actions>
        <el-button v-if="capabilities.tasksRead && capabilities.exportCsvCreate" tag="a" :href="exportUrl" :icon="Download">Export CSV</el-button>
      </template>
    </PageHeader>

    <BackendErrorDetails v-if="loadError || accessError" :error="loadError || accessError" />
    <AccessDenied
      v-else-if="!accessPending && !capabilities.tasksRead"
      description="You need BiszPortal.Tasks.read and task access on at least one project to view tasks."
    />
    <template v-else>
      <div class="task-toolbar surface">
        <el-input
          v-model="searchInput"
          :prefix-icon="Search"
          placeholder="Search tasks"
          clearable
          aria-label="Search tasks"
        />
        <el-select v-model="status" aria-label="Filter by status">
          <el-option label="All statuses" value="all" />
          <el-option label="To do" value="todo" />
          <el-option label="In review" value="in_review" />
          <el-option label="Done" value="done" />
        </el-select>
        <el-select v-model="projectId" clearable placeholder="All projects" aria-label="Filter by project">
          <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
        </el-select>
        <el-select v-model="due" clearable placeholder="Any due date" aria-label="Filter by due date">
          <el-option label="Overdue" value="overdue" />
          <el-option label="Today" value="today" />
          <el-option label="This week" value="week" />
          <el-option label="No due date" value="none" />
        </el-select>
        <el-input v-model="tag" clearable placeholder="Tag" aria-label="Filter by tag" />
        <UsersInput v-model="assignee" :maximum="1" placeholder="Assignee" />
        <el-checkbox v-model="mine">Only mine</el-checkbox>
        <el-select v-model="sort" aria-label="Sort tasks">
          <el-option label="Sort by due date" value="due" />
          <el-option label="Sort by created" value="created" />
        </el-select>
      </div>

      <SavedFilterBar scope="tasks" :current-query="savedQuery" @apply="applySavedFilter" />

      <div v-if="selected.length" class="bulk-bar surface">
        <strong>{{ selected.length }} selected</strong>
        <el-select v-model="bulkAction" aria-label="Bulk action">
          <el-option label="Set status" value="status" />
          <el-option label="Assign" value="assign" />
          <el-option label="Add tag" value="add-tag" />
          <el-option label="Remove tag" value="remove-tag" />
        </el-select>
        <el-select v-if="bulkAction === 'status'" v-model="bulkStatus" aria-label="Bulk status">
          <el-option label="To do" value="todo" />
          <el-option label="Done" value="done" />
        </el-select>
        <UsersInput v-else-if="bulkAction === 'assign'" v-model="bulkUsers" :maximum="1" placeholder="Assignee" />
        <SharedInputTag v-else v-model="bulkTags" :max="1" placeholder="Tag" />
        <el-button type="primary" :loading="bulkBusy" @click="applyBulk">Apply</el-button>
        <el-button text :icon="Delete" @click="selected = []">Clear</el-button>
      </div>

      <div v-if="tasks.length" class="task-groups">
        <button type="button" class="select-all" @click="toggleAll">
          <el-checkbox :model-value="allVisibleSelected" />
          Select all visible
        </button>
        <section v-for="group in filteredGroups" :key="group.date" class="task-group">
          <h2>{{ group.label }}</h2>
          <div class="assignment-list">
            <div v-for="task in group.tasks" :key="task.id" class="assignment" :class="{ 'is-selected': selected.includes(task.id) }">
              <el-checkbox
                :model-value="selected.includes(task.id)"
                :aria-label="`Select ${task.title}`"
                @change="toggleTask(task.id)"
              />
              <NuxtLink class="assignment__main" :to="`/tasks/${encodeURIComponent(task.id)}`">
                <strong>{{ task.title }}</strong>
                <small>{{ markdownExcerpt(task.description, 180) }}</small>
                <span>{{ task.projectName }}</span>
              </NuxtLink>
              <div class="assignment__tags">
                <el-tag v-for="taskTag in task.tags" :key="taskTag.name" size="small" effect="plain">
                  <span class="task-tag__color" :style="{ backgroundColor: tagColorValue(taskTag.color) }" />
                  {{ taskTag.name }}
                </el-tag>
              </div>
              <el-tag
                :type="task.status === 'done' ? 'success' : task.status === 'in_review' ? 'warning' : 'info'"
                size="small"
              >
                {{ taskStatusLabel(task.status) }}
              </el-tag>
              <span class="assignment__due">{{ formatTaskDueDate(task.dueDate) }}</span>
              <span v-if="task.members.length" class="assignment__members">
                <el-tooltip
                  v-for="member in task.members.slice(0, 3)"
                  :key="member.userId"
                  :content="member.displayName"
                  placement="top"
                >
                  <el-avatar :size="24" :src="member.image ?? undefined">
                    {{ initials(member.displayName) }}
                  </el-avatar>
                </el-tooltip>
              </span>
            </div>
          </div>
        </section>
        <el-button v-if="nextCursor" :loading="loading" class="load-more" @click="fetchTasks(false)">
          Load more tasks
        </el-button>
      </div>
      <el-empty v-else-if="!loading" :image-size="84" description="No tasks match these filters." />
      <div v-else v-loading="loading" class="loading-surface" />
    </template>
  </section>
</template>

<style scoped>
.tasks-page {
  display: grid;
  gap: 12px;
}

.task-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) repeat(5, minmax(120px, 1fr)) auto auto;
  align-items: center;
  gap: 8px;
  padding: 12px;
}

.bulk-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-color: var(--accent);
}

.bulk-bar strong {
  margin-right: auto;
  font-size: 13px;
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  padding: 0;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.task-groups {
  display: grid;
  gap: 24px;
  margin-top: 4px;
}

.task-group h2 {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.assignment-list {
  display: grid;
  gap: 4px;
}

.assignment {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 0.8fr) auto auto auto;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 10px 12px;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.assignment.is-selected {
  border-color: var(--accent);
}

.assignment__main {
  display: grid;
  min-width: 0;
  gap: 2px;
  color: var(--text-primary);
  text-decoration: none;
}

.assignment__main strong,
.assignment__main small,
.assignment__main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assignment__main strong {
  font-size: 13px;
}

.assignment__main small,
.assignment__main span {
  color: var(--text-muted);
  font-size: 11px;
}

.assignment__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  min-width: 0;
}

.assignment__tags :deep(.el-tag) {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.task-tag__color {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.assignment__due {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.assignment__members {
  display: inline-flex;
}

.load-more {
  justify-self: center;
}

.loading-surface {
  min-height: 240px;
}

@media (max-width: 1200px) {
  .task-toolbar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .task-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .task-toolbar > :first-child,
  .task-toolbar > .el-checkbox {
    grid-column: 1 / -1;
  }

  .assignment {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
  }

  .assignment__tags,
  .assignment__due,
  .assignment__members {
    display: none;
  }
}
</style>
