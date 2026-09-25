<script setup lang="ts">
import { Calendar, DocumentChecked } from "@element-plus/icons-vue"
import type { TaskView } from "~/shared/contracts"

const { capabilities, pending: accessPending } = usePortalAccess()
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined
const { data, pending, error } = await useFetch<{ tasks: TaskView[] }>("/api/tasks", { headers })
const projectFilter = ref("")
const statusFilter = ref("")
const drawerOpen = ref(false)
const selected = ref<TaskView | null>(null)
const tasks = computed(() => data.value?.tasks ?? [])
const projects = computed(() => [...new Map(tasks.value.map((task) => [task.projectId, task.projectName])).entries()])
const filteredTasks = computed(() => tasks.value.filter((task) =>
  (!projectFilter.value || task.projectId === projectFilter.value) && (!statusFilter.value || task.status === statusFilter.value),
))

function openTask(task: TaskView) { selected.value = task; drawerOpen.value = true }
function label(value: string) { return value.replace("_", " ") }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "No due date" }
</script>

<template>
  <section>
    <header class="page-header"><h1>Tasks</h1><p>Review assignments across the projects you can access.</p></header>
    <AccessDenied v-if="!accessPending && (error || !capabilities.tasksRead)" description="You need BiszPortal.Tasks.read and task access on at least one project to view assignments." />
    <el-card v-else shadow="never" v-loading="pending">
      <template #header><div class="task-toolbar"><strong>Assignments</strong><div><el-select v-model="projectFilter" clearable placeholder="All projects"><el-option v-for="[id, name] in projects" :key="id" :label="name" :value="id" /></el-select><el-select v-model="statusFilter" clearable placeholder="All statuses"><el-option label="To do" value="todo" /><el-option label="In progress" value="in_progress" /><el-option label="Done" value="done" /></el-select></div></div></template>
      <div v-if="filteredTasks.length" class="assignment-list">
        <button v-for="task in filteredTasks" :key="task.id" class="assignment" type="button" @click="openTask(task)">
          <span class="assignment__icon"><el-icon><DocumentChecked /></el-icon></span>
          <span class="assignment__main"><strong>{{ task.title }}</strong><small>{{ task.projectName }}</small></span>
          <el-tag :type="task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'warning' : 'info'" size="small">{{ label(task.status) }}</el-tag>
          <span class="assignment__due"><el-icon><Calendar /></el-icon>{{ formatDate(task.dueDate) }}</span>
        </button>
      </div>
      <el-empty v-else :image-size="84" description="No assignments match these filters." />
    </el-card>

    <el-drawer v-model="drawerOpen" size="min(560px, 94vw)">
      <template #header><div><small class="drawer-eyebrow">{{ selected?.projectName }}</small><h2>{{ selected?.title }}</h2></div></template>
      <template v-if="selected"><div class="task-meta"><el-tag :type="selected.status === 'done' ? 'success' : selected.status === 'in_progress' ? 'warning' : 'info'">{{ label(selected.status) }}</el-tag><span><el-icon><Calendar /></el-icon>{{ formatDate(selected.dueDate) }}</span></div><section class="task-description"><h3>Assignment details</h3><p>{{ selected.description || 'No description provided.' }}</p></section><el-alert title="Read-only task" description="Task changes will be added in a later platform slice." type="info" :closable="false" show-icon /></template>
    </el-drawer>
  </section>
</template>

<style scoped>
.task-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; }.task-toolbar > div { display: flex; gap: 8px; }.task-toolbar .el-select { width: 170px; }
.assignment-list { display: grid; }.assignment { display: grid; grid-template-columns: 38px minmax(220px, 1fr) 110px 150px; align-items: center; gap: 14px; width: 100%; padding: 14px 8px; color: inherit; text-align: left; background: transparent; border: 0; border-bottom: 1px solid var(--el-border-color-lighter); cursor: pointer; font: inherit; }.assignment:hover { background: var(--el-fill-color-light); }.assignment__icon { display: grid; width: 34px; height: 34px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); border-radius: 5px; place-items: center; }.assignment__main { display: flex; flex-direction: column; gap: 4px; }.assignment__main strong { font-size: 13px; }.assignment__main small, .assignment__due { color: var(--el-text-color-secondary); font-size: 11px; }.assignment__due { display: flex; align-items: center; gap: 6px; }
.drawer-eyebrow { color: var(--el-text-color-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }.drawer-eyebrow + h2 { margin: 4px 0 0; color: var(--el-text-color-primary); font-size: 20px; }.task-meta { display: flex; align-items: center; gap: 14px; }.task-meta span { display: flex; align-items: center; gap: 6px; color: var(--el-text-color-regular); font-size: 12px; }.task-description { margin: 24px 0; padding: 18px; background: var(--el-fill-color-light); border-radius: 6px; }.task-description h3 { margin: 0 0 8px; font-size: 13px; }.task-description p { margin: 0; color: var(--el-text-color-regular); font-size: 13px; line-height: 1.65; white-space: pre-wrap; }
@media (max-width: 700px) { .task-toolbar { align-items: stretch; flex-direction: column; }.task-toolbar > div { flex-direction: column; }.task-toolbar .el-select { width: 100%; }.assignment { grid-template-columns: 34px 1fr auto; }.assignment__due { display: none; } }
</style>
