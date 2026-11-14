<script setup lang="ts">
import { CopyDocument, Delete, EditPen } from "@element-plus/icons-vue";
import type {
  TaskActions,
  TaskMemberView,
  TaskStatus,
  TaskView,
  UserSummary,
} from "~/shared/contracts";
import { formatDate, formatDateTime } from "~/utils/format";

const route = useRoute();
const taskId = computed(() => String(route.params.taskId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error, refresh } = await useFetch<{
  task: TaskView;
  actions: TaskActions;
}>(
  () => `/api/tasks/${encodeURIComponent(taskId.value)}`,
  { headers },
);
const task = computed(() => data.value?.task);
const actions = computed(() => data.value?.actions);
const activeTab = useHashTab("description", ["description", "comments", "activity"]);
const changingStatus = ref(false);
const changingMembers = ref(false);
const selectedMembers = ref<UserSummary[]>([]);
const requestError = shallowRef<unknown>(null);
const activityFeed = ref<{ refresh: () => void }>();
const editing = ref(false);
const saving = ref(false);
const duplicating = ref(false);
const deleting = ref(false);
const templateDialog = ref(false);
const templateName = ref("");
const savingTemplate = ref(false);
const taskMemberRoles = [{ label: "Assignee", value: "assignee" }];
const taskMemberIds = computed(
  () => task.value?.members.map((member) => member.userId) ?? [],
);
const form = reactive({
  title: "",
  description: "",
  dueDate: null as string | null,
  tags: [] as string[],
});

watch(
  task,
  (value) => {
    if (!value) return;
    form.title = value.title;
    form.description = value.description;
    form.dueDate = value.dueDate;
    form.tags = value.tags.map((tag) => tag.name);
  },
  { immediate: true },
);

async function changeStatus(status: TaskStatus) {
  if (!task.value || changingStatus.value) return;
  const copy =
    status === "in_review"
      ? {
          title: "Submit task for review?",
          message:
            "Project editing will be locked until a reviewer returns or completes this task.",
          confirm: "Submit for review",
        }
      : status === "todo"
        ? {
            title: "Return task to do?",
            message: "Project editing will be unlocked so work can continue.",
            confirm: "Return to do",
          }
        : {
            title: "Complete task?",
            message: "The task will be completed and project editing will be unlocked.",
            confirm: "Complete",
          };
  const confirmed = await ElMessageBox.confirm(copy.message, copy.title, {
    confirmButtonText: copy.confirm,
    type: status === "done" ? "success" : "warning",
  }).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  changingStatus.value = true;
  try {
    data.value = await $fetch<{ task: TaskView; actions: TaskActions }>(
      `/api/tasks/${encodeURIComponent(task.value.id)}/status`,
      { method: "PATCH", body: { status } },
    );
    requestError.value = null;
    activityFeed.value?.refresh();
    ElMessage.success(`Task is now ${taskStatusLabel(status)}`);
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The task status could not be changed."));
  } finally {
    changingStatus.value = false;
  }
}

async function saveTask() {
  if (!task.value || saving.value) return;
  saving.value = true;
  try {
    const response = await $fetch<{ task: TaskView }>(
      `/api/tasks/${encodeURIComponent(task.value.id)}`,
      { method: "PATCH", body: { ...form } },
    );
    if (data.value) data.value.task = response.task;
    editing.value = false;
    requestError.value = null;
    ElMessage.success("Task updated");
    await refresh();
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The task could not be updated."));
  } finally {
    saving.value = false;
  }
}

async function duplicateTask() {
  if (!task.value || duplicating.value) return;
  duplicating.value = true;
  try {
    const response = await $fetch<{ task: TaskView }>(
      `/api/tasks/${encodeURIComponent(task.value.id)}/duplicate`,
      { method: "POST", body: {} },
    );
    ElMessage.success("Task duplicated");
    await navigateTo(`/tasks/${encodeURIComponent(response.task.id)}`);
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The task could not be duplicated."));
  } finally {
    duplicating.value = false;
  }
}

function openTemplateDialog() {
  if (!task.value) return;
  templateName.value = task.value.title.slice(0, 80);
  templateDialog.value = true;
}

async function saveTemplate() {
  if (!task.value || !templateName.value.trim() || savingTemplate.value) return;
  savingTemplate.value = true;
  try {
    const dueOffsetDays = task.value.dueDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(`${task.value.dueDate}T00:00:00`).getTime() -
              new Date().setHours(0, 0, 0, 0)) /
              86_400_000,
          ),
        )
      : null;
    await $fetch(
      `/api/projects/${encodeURIComponent(task.value.projectId)}/task-templates`,
      {
        method: "POST",
        body: {
          name: templateName.value.trim(),
          title: task.value.title,
          description: task.value.description,
          dueOffsetDays,
          tags: task.value.tags.map((tag) => tag.name),
          memberIds: task.value.members.map((member) => member.userId),
        },
      },
    );
    templateDialog.value = false;
    ElMessage.success("Task template saved");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The template could not be saved."));
  } finally {
    savingTemplate.value = false;
  }
}

async function deleteTask() {
  if (!task.value || deleting.value) return;
  const confirmed = await ElMessageBox.confirm(
    "Delete this task and its comments? This cannot be undone.",
    "Delete task",
    { type: "error", confirmButtonText: "Delete" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  deleting.value = true;
  try {
    await $fetch(`/api/tasks/${encodeURIComponent(task.value.id)}`, {
      method: "DELETE",
    });
    ElMessage.success("Task deleted");
    await navigateTo(`/projects/${encodeURIComponent(task.value.projectId)}#tasks`);
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The task could not be deleted."));
  } finally {
    deleting.value = false;
  }
}

async function addTaskMembers() {
  if (!task.value || !actions.value?.manageMembers || !selectedMembers.value.length)
    return;
  changingMembers.value = true;
  try {
    for (const user of selectedMembers.value) {
      const response = await $fetch<{ member: TaskMemberView }>(
        `/api/tasks/${encodeURIComponent(task.value.id)}/members`,
        { method: "POST", body: { userId: user.id } },
      );
      task.value.members = [...task.value.members, response.member];
    }
    selectedMembers.value = [];
    requestError.value = null;
    ElMessage.success("Task members added");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "Task members could not be added."));
  } finally {
    changingMembers.value = false;
  }
}

async function removeTaskMember(member: { userId: string; displayName: string }) {
  if (!task.value || !actions.value?.manageMembers) return;
  const confirmed = await ElMessageBox.confirm(
    `Remove ${member.displayName} from this task?`,
    "Remove task member",
    { type: "warning", confirmButtonText: "Remove" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  changingMembers.value = true;
  try {
    await $fetch(
      `/api/tasks/${encodeURIComponent(task.value.id)}/members/${encodeURIComponent(member.userId)}`,
      { method: "DELETE" },
    );
    task.value.members = task.value.members.filter(
      (candidate) => candidate.userId !== member.userId,
    );
    requestError.value = null;
    ElMessage.success("Task member removed");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The task member could not be removed."));
  } finally {
    changingMembers.value = false;
  }
}

useHead(() => ({ title: task.value ? `${task.value.title} · Tasks` : "Task" }));
</script>

<template>
  <section v-loading="pending" class="page task-detail">
    <BackendErrorDetails v-if="error || requestError" :error="requestError || error" />

    <template v-if="task">
      <PageHeader :title="task.title" :back-to="`/projects/${encodeURIComponent(task.projectId)}#tasks`" back-label="Project tasks">
        <template #meta>
          <div class="task-meta">
            <el-tag
              :type="task.status === 'done' ? 'success' : task.status === 'in_review' ? 'warning' : 'info'"
            >
              {{ taskStatusLabel(task.status) }}
            </el-tag>
            <span class="muted">{{ task.projectName }}</span>
            <span class="muted">{{ formatTaskDueDate(task.dueDate) }}</span>
          </div>
          <div v-if="task.tags.length" class="task-tags" aria-label="Task tags">
            <el-tag v-for="tag in task.tags" :key="tag.name" effect="plain" size="small">
              <span class="task-tag__color" :style="{ backgroundColor: tagColorValue(tag.color) }" />
              {{ tag.name }}
            </el-tag>
          </div>
        </template>
        <template #actions>
          <el-button
            v-if="actions?.submitForReview"
            type="primary"
            :loading="changingStatus"
            @click="changeStatus('in_review')"
          >
            Submit for review
          </el-button>
          <template v-if="actions?.review">
            <el-button :disabled="changingStatus" @click="changeStatus('todo')">
              Return to do
            </el-button>
            <el-button type="success" :loading="changingStatus" @click="changeStatus('done')">
              Complete
            </el-button>
          </template>
          <el-button v-if="actions?.edit" :icon="EditPen" @click="editing = !editing">
            {{ editing ? "Close editor" : "Edit" }}
          </el-button>
          <el-button v-if="actions?.duplicate" :icon="CopyDocument" :loading="duplicating" @click="duplicateTask">
            Duplicate
          </el-button>
          <el-button v-if="actions?.duplicate" text @click="openTemplateDialog">
            Save as template
          </el-button>
          <el-dropdown v-if="actions?.delete">
            <el-button text :icon="Delete" aria-label="More task actions" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item class="danger-item" @click="deleteTask">Delete task</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </PageHeader>

      <div class="task-layout">
        <div class="task-main">
          <el-card v-if="editing" shadow="never" class="task-editor">
            <el-form label-position="top" @submit.prevent="saveTask">
              <el-form-item label="Title">
                <el-input v-model="form.title" maxlength="120" show-word-limit />
              </el-form-item>
              <el-form-item label="Tags">
                <SharedInputTag v-model="form.tags" :max="20" placeholder="Search for a tag" />
              </el-form-item>
              <el-form-item label="Description">
                <MarkdownEditor v-model="form.description" :maxlength="50_000" />
              </el-form-item>
              <el-form-item label="Due date">
                <el-date-picker
                  v-model="form.dueDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="No due date"
                  clearable
                />
              </el-form-item>
              <div class="task-editor__actions">
                <el-button @click="editing = false">Cancel</el-button>
                <el-button type="primary" :loading="saving" @click="saveTask">Save task</el-button>
              </div>
            </el-form>
          </el-card>

          <el-tabs v-model="activeTab">
            <el-tab-pane label="Description" name="description">
              <div class="description-panel">
                <MarkdownContent :source="task.description" />
              </div>
            </el-tab-pane>
            <el-tab-pane label="Comments" name="comments">
              <CommentThread
                :project-id="task.projectId"
                :task-id="task.id"
                :can-write="Boolean(actions?.comment)"
                @changed="refresh(); activityFeed?.refresh()"
              />
            </el-tab-pane>
            <el-tab-pane label="Activity" name="activity">
              <ActivityFeed ref="activityFeed" :project-id="task.projectId" :task-id="task.id" />
            </el-tab-pane>
          </el-tabs>
        </div>

        <aside class="task-sidebar">
          <section class="surface task-side-card">
            <h2>Details</h2>
            <dl>
              <div><dt>Project</dt><dd><NuxtLink :to="`/projects/${encodeURIComponent(task.projectId)}`">{{ task.projectName }}</NuxtLink></dd></div>
              <div><dt>Status</dt><dd>{{ taskStatusLabel(task.status) }}</dd></div>
              <div><dt>Due</dt><dd>{{ task.dueDate ? formatDate(task.dueDate) : "No due date" }}</dd></div>
              <div><dt>Created</dt><dd>{{ formatDateTime(task.createdAt) }}</dd></div>
              <div><dt>Updated</dt><dd>{{ formatDateTime(task.updatedAt) }}</dd></div>
            </dl>
          </section>

          <section class="surface task-side-card">
            <h2>Assignees</h2>
            <UserGroupViewer
              :users="task.members"
              :roles="taskMemberRoles"
              :removable="Boolean(actions?.manageMembers)"
              :loading="changingMembers"
              empty-text="No one assigned"
              @remove="removeTaskMember"
            />
            <div v-if="actions?.manageMembers" class="task-member-add">
              <UsersInput
                v-model="selectedMembers"
                :exclude-ids="taskMemberIds"
                :project-id="task.projectId"
                placeholder="Search project members"
              />
              <el-button
                type="primary"
                :loading="changingMembers"
                :disabled="!selectedMembers.length"
                @click="addTaskMembers"
              >
                Assign
              </el-button>
            </div>
          </section>
        </aside>
      </div>
    </template>

    <el-dialog v-model="templateDialog" title="Save task as template" width="min(440px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveTemplate">
        <el-form-item label="Template name">
          <el-input v-model="templateName" maxlength="80" show-word-limit autofocus />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="savingTemplate" :disabled="!templateName.trim()" @click="saveTemplate">
          Save template
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.task-detail {
  display: grid;
  gap: 16px;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
}

.task-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.task-tags :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.task-tag__color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.task-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: start;
  gap: 20px;
}

.task-main {
  min-width: 0;
}

.description-panel {
  min-height: 180px;
  padding-top: 8px;
}

.task-editor {
  margin-bottom: 16px;
}

.task-editor :deep(.el-date-editor) {
  width: 100%;
}

.task-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.task-sidebar {
  display: grid;
  gap: 12px;
}

.task-side-card {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.task-side-card h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.task-side-card dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.task-side-card dl div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.task-side-card dt {
  color: var(--text-muted);
  font-size: 12px;
}

.task-side-card dd {
  margin: 0;
  font-size: 12px;
  text-align: right;
}

.task-side-card dd a {
  color: var(--accent);
  text-decoration: none;
}

.task-member-add {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.danger-item {
  color: var(--status-danger);
}

@media (max-width: 1023px) {
  .task-layout {
    grid-template-columns: 1fr;
  }
}
</style>
