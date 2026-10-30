<script setup lang="ts">
import type { TaskView } from "~/shared/contracts";

const route = useRoute();
const taskId = computed(() => String(route.params.taskId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ task: TaskView }>(
  () => `/api/tasks/${encodeURIComponent(taskId.value)}`,
  { headers },
);
const task = computed(() => data.value?.task);
const activeTab = ref("description");

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}
</script>

<template>
  <section v-loading="pending">
    <BackendErrorDetails v-if="error" :error="error" />

    <template v-if="task">
      <header class="page-header task-header">
        <div>
          <el-link :underline="false" href="/tasks">Tasks</el-link>
          <h1>{{ task.title }}</h1>
          <pre class="task-id">{{ task.id }}</pre>
        </div>
        <el-button
          tag="a"
          :href="`/projects/${encodeURIComponent(task.projectId)}`"
        >
          View project
        </el-button>
      </header>

      <el-card shadow="never" class="details-card">
        <el-descriptions title="Task details" :column="2" border>
          <el-descriptions-item label="Title">
            {{ task.title }}
          </el-descriptions-item>
          <el-descriptions-item label="Status">
            <el-tag
              :type="
                task.status === 'done'
                  ? 'success'
                  : task.status === 'in_progress'
                    ? 'warning'
                    : 'info'
              "
            >
              {{ taskStatusLabel(task.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Task ID">
            <pre>{{ task.id }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="Project">
            <el-link
              :underline="false"
              :href="`/projects/${encodeURIComponent(task.projectId)}`"
            >
              {{ task.projectName }}
            </el-link>
          </el-descriptions-item>
          <el-descriptions-item label="Due date">
            {{ formatTaskDueDate(task.dueDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="Created">
            {{ formatTimestamp(task.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="Last updated" :span="2">
            {{ formatTimestamp(task.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="Description" name="description">
          <div class="description-panel">
            <MarkdownContent :source="task.description" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </section>
</template>

<style scoped>
.task-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.task-header h1 {
  margin-top: 8px;
}

.task-id,
pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: 12px/1.5 var(--el-font-family);
}

.details-card {
  margin-bottom: 18px;
}

.description-panel {
  min-height: 180px;
  padding-top: 8px;
}

@media (max-width: 700px) {
  .task-header {
    align-items: stretch;
    flex-direction: column;
  }

  .details-card :deep(.el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
