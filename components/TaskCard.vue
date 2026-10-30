<script setup lang="ts">
import { Calendar } from "@element-plus/icons-vue";
import type { TaskView } from "~/shared/contracts";

const props = defineProps<{ task: TaskView }>();
const description = computed(() => markdownExcerpt(props.task.description));
</script>

<template>
  <NuxtLink
    class="task-card"
    :to="`/tasks/${encodeURIComponent(task.id)}`"
    :aria-label="`Open task ${task.title}`"
  >
    <span class="task-card__main">
      <strong>{{ task.title }}</strong>
      <span>{{ description }}</span>
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
    <span class="task-card__due">
      <el-icon><Calendar /></el-icon>
      {{ formatTaskDueDate(task.dueDate) }}
    </span>
  </NuxtLink>
</template>

<style scoped>
.task-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 160px;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  color: inherit;
  text-decoration: none;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.task-card:hover,
.task-card:focus-visible {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
  outline: none;
}

.task-card__main {
  min-width: 0;
}

.task-card__main strong,
.task-card__main span {
  display: block;
  overflow: hidden;
}

.task-card__main strong {
  margin-bottom: 4px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card__main span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.task-card__due {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 700px) {
  .task-card {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .task-card__due {
    grid-column: 1 / -1;
  }
}
</style>
