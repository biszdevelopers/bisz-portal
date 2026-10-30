<script setup lang="ts">
import { DocumentChecked } from "@element-plus/icons-vue";
import type { TaskView } from "~/shared/contracts";

const {
  capabilities,
  pending: accessPending,
  error: accessError,
} = usePortalAccess();
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ tasks: TaskView[] }>(
  "/api/tasks",
  { headers },
);
const projectFilter = ref("");
const statusFilter = ref("all");
const tasks = computed(() => data.value?.tasks ?? []);
const projects = computed(() => [
  ...new Map(
    tasks.value.map((task) => [task.projectId, task.projectName]),
  ).entries(),
]);
const filteredTasks = computed(() =>
  tasks.value.filter(
    (task) =>
      (!projectFilter.value || task.projectId === projectFilter.value) &&
      (statusFilter.value === "all" || task.status === statusFilter.value),
  ),
);
const groupedTasks = computed(() => {
  const sorted = [...filteredTasks.value].sort((left, right) => {
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

function taskDateHeading(value: string) {
  if (value === "undated") return "No due date";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Invalid due date";
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}
</script>

<template>
  <section v-loading="pending">
    <header class="page-header">
      <h1>Tasks</h1>
      <p>Review work across the projects you can access.</p>
    </header>

    <BackendErrorDetails
      v-if="error || accessError"
      :error="error || accessError"
    />
    <AccessDenied
      v-else-if="!accessPending && !capabilities.tasksRead"
      description="You need BiszPortal.Tasks.read and task access on at least one project to view tasks."
    />
    <template v-else>
      <div class="task-filters">
        <el-tabs v-model="statusFilter" class="status-tabs">
          <el-tab-pane label="All" name="all" />
          <el-tab-pane label="To do" name="todo" />
          <el-tab-pane label="In progress" name="in_progress" />
          <el-tab-pane label="Done" name="done" />
        </el-tabs>
        <el-select
          v-model="projectFilter"
          clearable
          placeholder="All projects"
          aria-label="Filter tasks by project"
        >
          <el-option
            v-for="[id, name] in projects"
            :key="id"
            :label="name"
            :value="id"
          />
        </el-select>
      </div>

      <div v-if="groupedTasks.length" class="task-groups">
        <section
          v-for="group in groupedTasks"
          :key="group.date"
          class="task-group"
        >
          <h2>{{ group.label }}</h2>
          <div class="assignment-list">
            <NuxtLink
              v-for="task in group.tasks"
              :key="task.id"
              class="assignment"
              :to="`/tasks/${encodeURIComponent(task.id)}`"
              :aria-label="`Open task ${task.title}`"
            >
              <span class="assignment__icon">
                <el-icon><DocumentChecked /></el-icon>
              </span>
              <span class="assignment__main">
                <strong>{{ task.title }}</strong>
                <small>{{ markdownExcerpt(task.description, 180) }}</small>
                <span>{{ task.projectName }}</span>
              </span>
              <el-tag
                :type="
                  task.status === 'done'
                    ? 'success'
                    : task.status === 'in_progress'
                      ? 'warning'
                      : 'info'
                "
                size="small"
              >
                {{ taskStatusLabel(task.status) }}
              </el-tag>
            </NuxtLink>
          </div>
        </section>
      </div>
      <el-empty
        v-else
        :image-size="84"
        description="No tasks match these filters."
      />
    </template>
  </section>
</template>

<style scoped>
.task-filters {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.status-tabs {
  min-width: 0;
}

.status-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.status-tabs :deep(.el-tabs__content) {
  display: none;
}

.task-filters .el-select {
  width: 190px;
  margin-top: 2px;
}

.task-groups {
  display: grid;
  gap: 28px;
}

.task-group h2 {
  margin: 0 0 10px;
  color: var(--el-text-color-regular);
  font-size: 14px;
  font-weight: 650;
}

.assignment-list {
  display: grid;
  gap: 6px;
}

.assignment {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 72px;
  padding: 12px 14px;
  color: inherit;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.assignment:hover,
.assignment:focus-visible {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color);
  outline: none;
}

.assignment__icon {
  display: grid;
  width: 34px;
  height: 34px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 5px;
  place-items: center;
}

.assignment__main {
  display: grid;
  min-width: 0;
  gap: 3px;
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
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

@media (max-width: 700px) {
  .task-filters {
    align-items: stretch;
    flex-direction: column-reverse;
    gap: 8px;
  }

  .task-filters .el-select {
    width: 100%;
    margin-top: 0;
  }

  .status-tabs {
    overflow-x: auto;
  }
}
</style>
