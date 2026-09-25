<script setup lang="ts">
import MarkdownIt from "markdown-it"
import { Box, EditPen, FolderAdd, Plus, User } from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox } from "element-plus"
import type { ProjectMemberView, ProjectSummary, TaskView } from "~/shared/contracts"
import { ProjectPermissions, projectPermissionValues, type ProjectPermission } from "~/shared/permissions"

type ProjectDetail = ProjectSummary & { members: ProjectMemberView[], tasks: TaskView[] }
type ProjectResponse = { project: ProjectDetail }
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
const { capabilities, pending: accessPending } = usePortalAccess()
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined
const { data, pending, error, refresh } = await useFetch<{ projects: ProjectSummary[] }>("/api/projects", { headers })
const activeTab = ref<"active" | "archived">("active")
const drawerOpen = ref(false)
const mode = ref<"create" | "view" | "edit">("view")
const selected = ref<ProjectDetail | null>(null)
const detailLoading = ref(false)
const submitting = ref(false)
const form = reactive({ name: "", slug: "", description: "" })
const newMember = reactive<{ userId: string, permissions: ProjectPermission[] }>({ userId: "", permissions: [ProjectPermissions.projectRead, ProjectPermissions.tasksRead] })

const projects = computed(() => data.value?.projects ?? [])
const filteredProjects = computed(() => projects.value.filter((project) => project.status === activeTab.value))
const slugPreview = computed(() => form.slug || form.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))

function resetForm(project?: ProjectDetail) {
  form.name = project?.name ?? ""
  form.slug = project?.slug ?? ""
  form.description = project?.description ?? ""
}

function openCreate() {
  selected.value = null
  resetForm()
  mode.value = "create"
  drawerOpen.value = true
}

async function openProject(project: ProjectSummary) {
  drawerOpen.value = true
  detailLoading.value = true
  mode.value = "view"
  try {
    const response = await $fetch<ProjectResponse>(`/api/projects/${project.id}`)
    selected.value = response.project
    resetForm(response.project)
  } catch { ElMessage.error("The project could not be loaded.") }
  finally { detailLoading.value = false }
}

async function saveProject() {
  submitting.value = true
  try {
    if (mode.value === "create") {
      const response = await $fetch<ProjectResponse>("/api/projects", { method: "POST", body: { ...form, slug: form.slug || undefined } })
      selected.value = response.project
      mode.value = "view"
      ElMessage.success("Project created")
    } else if (selected.value) {
      const response = await $fetch<ProjectResponse>(`/api/projects/${selected.value.id}`, { method: "PATCH", body: form })
      selected.value = response.project
      mode.value = "view"
      ElMessage.success("Project updated")
    }
    await refresh()
  } catch (caught: any) { ElMessage.error(caught?.data?.error_description || "The project could not be saved.") }
  finally { submitting.value = false }
}

async function archiveProject() {
  if (!selected.value) return
  await ElMessageBox.confirm("Archive this project? Linked tasks and incidents will remain available in the database.", "Archive project", { type: "warning" })
  try {
    await $fetch(`/api/projects/${selected.value.id}/archive`, { method: "POST" })
    drawerOpen.value = false
    activeTab.value = "archived"
    await refresh()
    ElMessage.success("Project archived")
  } catch (caught: any) { ElMessage.error(caught?.data?.error_description || "The project could not be archived.") }
}

async function addMember() {
  if (!selected.value) return
  try {
    const response = await $fetch<ProjectResponse>(`/api/projects/${selected.value.id}/members`, { method: "POST", body: newMember })
    selected.value = response.project
    newMember.userId = ""
    ElMessage.success("Member added")
    await refresh()
  } catch (caught: any) { ElMessage.error(caught?.data?.error_description || "The member could not be added.") }
}

async function saveMember(member: ProjectMemberView) {
  if (!selected.value || member.role === "owner") return
  try {
    const response = await $fetch<ProjectResponse>(`/api/projects/${selected.value.id}/members/${member.userId}`, { method: "PATCH", body: { permissions: member.permissions } })
    selected.value = response.project
    ElMessage.success("Member access updated")
  } catch (caught: any) { ElMessage.error(caught?.data?.error_description || "Member access could not be updated.") }
}

async function removeMember(member: ProjectMemberView) {
  if (!selected.value || member.role === "owner") return
  await ElMessageBox.confirm(`Remove ${member.displayName} from this project?`, "Remove member", { type: "warning" })
  try {
    const response = await $fetch<ProjectResponse>(`/api/projects/${selected.value.id}/members/${member.userId}`, { method: "DELETE" })
    selected.value = response.project
    await refresh()
    ElMessage.success("Member removed")
  } catch (caught: any) { ElMessage.error(caught?.data?.error_description || "The member could not be removed.") }
}

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) }
function statusLabel(value: string) { return value.replace("_", " ") }
</script>

<template>
  <section>
    <header class="page-header projects-header">
      <div><h1>Projects</h1><p>Projects bring members, tasks, and incidents into one working space.</p></div>
      <el-tooltip :disabled="capabilities.projectsCreate" content="Requires BiszPortal.Projects.create">
        <span><el-button type="primary" :icon="FolderAdd" :disabled="!capabilities.projectsCreate" @click="openCreate">New project</el-button></span>
      </el-tooltip>
    </header>

    <AccessDenied v-if="!accessPending && (error || !capabilities.projectsRead)" description="You need BiszPortal.Projects.read to view projects. The navigation and workspace remain visible so everyone has the same portal structure." />
    <el-card v-else shadow="never" class="project-surface" v-loading="pending">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="active"><template #label>Active <el-tag size="small" round>{{ projects.filter(p => p.status === 'active').length }}</el-tag></template></el-tab-pane>
        <el-tab-pane name="archived"><template #label>Archived <el-tag size="small" type="info" round>{{ projects.filter(p => p.status === 'archived').length }}</el-tag></template></el-tab-pane>
      </el-tabs>
      <div v-if="filteredProjects.length" class="project-list">
        <button v-for="project in filteredProjects" :key="project.id" class="project-row" type="button" @click="openProject(project)">
          <span class="project-row__icon"><el-icon><FolderAdd /></el-icon></span>
          <span class="project-row__main"><strong>{{ project.name }}</strong><small>{{ project.description.replace(/^#+\s*/m, '').slice(0, 120) || 'No README description yet.' }}</small></span>
          <span class="project-row__metric"><strong>{{ project.memberCount }}</strong><small>members</small></span>
          <span class="project-row__metric"><strong>{{ project.completedTaskCount }}/{{ project.taskCount }}</strong><small>tasks done</small></span>
          <span class="project-row__updated"><small>Updated</small><span>{{ formatDate(project.updatedAt) }}</span></span>
        </button>
      </div>
      <el-empty v-else :description="activeTab === 'active' ? 'No active projects yet.' : 'No archived projects.'" />
    </el-card>

    <el-drawer v-model="drawerOpen" size="min(720px, 94vw)" :destroy-on-close="false">
      <template #header><div><span class="drawer-eyebrow">{{ mode === 'create' ? 'New project' : selected?.slug }}</span><h2>{{ mode === 'create' ? 'Create a project' : selected?.name }}</h2></div></template>
      <div v-loading="detailLoading" class="drawer-content">
        <el-form v-if="mode === 'create' || mode === 'edit'" label-position="top" @submit.prevent="saveProject">
          <el-form-item label="Project name"><el-input v-model="form.name" maxlength="120" show-word-limit /></el-form-item>
          <el-form-item label="Slug"><el-input v-model="form.slug" :placeholder="slugPreview || 'project-slug'"><template #prepend>/projects/</template></el-input></el-form-item>
          <el-form-item label="README description"><el-input v-model="form.description" type="textarea" :rows="13" placeholder="# Project overview&#10;&#10;Add goals, context, and working notes in Markdown." /></el-form-item>
          <div class="drawer-actions"><el-button @click="mode === 'create' ? (drawerOpen = false) : (mode = 'view')">Cancel</el-button><el-button type="primary" native-type="submit" :loading="submitting">{{ mode === 'create' ? 'Create project' : 'Save changes' }}</el-button></div>
        </el-form>

        <template v-else-if="selected">
          <div class="drawer-toolbar">
            <el-tooltip :disabled="selected.capabilities.update" content="Requires portal and project update access"><span><el-button :icon="EditPen" :disabled="!selected.capabilities.update || selected.status === 'archived'" @click="mode = 'edit'">Edit</el-button></span></el-tooltip>
            <el-tooltip :disabled="selected.capabilities.archive" content="Requires portal and project archive access"><span><el-button :icon="Box" :disabled="!selected.capabilities.archive || selected.status === 'archived'" @click="archiveProject">Archive</el-button></span></el-tooltip>
          </div>
          <section class="readme"><div class="section-title">README.md</div><div class="markdown-body" v-html="markdown.render(selected.description || '_No project description yet._')" /></section>
          <section class="drawer-section"><div class="section-title"><span>Members</span><el-tag size="small" type="info">{{ selected.members.length }}</el-tag></div>
            <div v-for="member in selected.members" :key="member.userId" class="member-card">
              <el-avatar :size="34" :src="member.image || undefined"><User /></el-avatar>
              <div class="member-main"><strong>{{ member.displayName }}</strong><small>{{ member.role }}</small></div>
              <el-popover v-if="selected.capabilities.manageMembers && member.role !== 'owner'" width="340" trigger="click">
                <template #reference><el-button size="small">Access</el-button></template>
                <el-checkbox-group v-model="member.permissions" class="permission-grid"><el-checkbox v-for="permission in projectPermissionValues" :key="permission" :value="permission">{{ permission }}</el-checkbox></el-checkbox-group>
                <div class="member-actions"><el-button size="small" type="danger" plain @click="removeMember(member)">Remove</el-button><el-button size="small" type="primary" @click="saveMember(member)">Save</el-button></div>
              </el-popover>
              <el-tag v-else size="small" :type="member.role === 'owner' ? 'primary' : 'info'">{{ member.role }}</el-tag>
            </div>
            <div v-if="selected.capabilities.manageMembers" class="add-member"><el-input v-model="newMember.userId" placeholder="Exact Basis user UUID" /><el-button :icon="Plus" @click="addMember">Add</el-button></div>
          </section>
          <section class="drawer-section"><div class="section-title"><span>Linked tasks</span><el-tag size="small" type="info">{{ selected.tasks.length }}</el-tag></div>
            <div v-for="task in selected.tasks" :key="task.id" class="task-summary"><span>{{ task.title }}</span><el-tag size="small" :type="task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'warning' : 'info'">{{ statusLabel(task.status) }}</el-tag></div>
            <el-empty v-if="!selected.tasks.length" :image-size="52" description="No linked tasks." />
          </section>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.projects-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.project-surface :deep(.el-card__body) { padding-top: 6px; }
.project-surface :deep(.el-tabs__header) { margin-bottom: 10px; }
.project-surface :deep(.el-tabs__nav-wrap::after) { height: 1px; }
.project-surface :deep(.el-tabs__item) { gap: 7px; }
.project-list { display: grid; }
.project-row { display: grid; grid-template-columns: 42px minmax(240px, 1fr) 100px 110px 130px; align-items: center; gap: 14px; width: 100%; padding: 16px 10px; color: inherit; text-align: left; background: transparent; border: 0; border-bottom: 1px solid var(--el-border-color-lighter); cursor: pointer; font: inherit; }
.project-row:hover { background: var(--el-fill-color-light); }
.project-row__icon { display: grid; width: 38px; height: 38px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); border-radius: 6px; place-items: center; }
.project-row__main, .project-row__metric, .project-row__updated { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
.project-row__main strong { font-size: 14px; }.project-row__main small { overflow: hidden; color: var(--el-text-color-secondary); text-overflow: ellipsis; white-space: nowrap; }
.project-row__metric strong { font-size: 14px; }.project-row__metric small, .project-row__updated small { color: var(--el-text-color-secondary); font-size: 11px; }.project-row__updated span { font-size: 12px; }
.drawer-eyebrow { color: var(--el-text-color-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }.drawer-content h2, :deep(.el-drawer__header h2) { margin: 3px 0 0; color: var(--el-text-color-primary); font-size: 20px; }
.drawer-actions, .drawer-toolbar { display: flex; justify-content: flex-end; gap: 8px; }.drawer-toolbar { margin-bottom: 18px; }
.readme, .drawer-section { margin-bottom: 22px; border: 1px solid var(--el-border-color-light); border-radius: 6px; }.section-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 11px 14px; font-size: 12px; font-weight: 600; background: var(--el-fill-color-light); border-bottom: 1px solid var(--el-border-color-light); }
.markdown-body { padding: 16px 20px; font-size: 13px; line-height: 1.65; }.markdown-body :deep(h1) { padding-bottom: 8px; font-size: 21px; border-bottom: 1px solid var(--el-border-color-light); }.markdown-body :deep(a) { color: var(--el-color-primary); }
.member-card, .task-summary { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid var(--el-border-color-lighter); }.member-card:last-child, .task-summary:last-child { border-bottom: 0; }.member-main { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 2px; }.member-main strong { font-size: 13px; }.member-main small { color: var(--el-text-color-secondary); font-size: 11px; text-transform: capitalize; }.task-summary { justify-content: space-between; font-size: 13px; }
.add-member { display: flex; gap: 8px; padding: 12px 14px; }.permission-grid { display: grid; grid-template-columns: 1fr 1fr; }.member-actions { display: flex; justify-content: space-between; margin-top: 12px; }
@media (max-width: 900px) { .project-row { grid-template-columns: 38px 1fr 90px; }.project-row__metric:first-of-type, .project-row__updated { display: none; } }
@media (max-width: 600px) { .projects-header { align-items: stretch; flex-direction: column; }.projects-header > div { min-width: 0; }.projects-header > span { display: block; width: 100%; }.projects-header .el-button { width: 100%; }.project-row { grid-template-columns: 38px 1fr; }.project-row__metric { display: none; }.add-member { flex-direction: column; } }
</style>
