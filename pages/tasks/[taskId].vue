<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  TaskActions,
  TaskMemberView,
  TaskStatus,
  TaskView,
  UserSummary,
} from "~/shared/contracts";

const route = useRoute();
const taskId = computed(() => String(route.params.taskId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{
  task: TaskView;
  actions: TaskActions;
}>(
  () => `/api/tasks/${encodeURIComponent(taskId.value)}`,
  { headers },
);
const task = computed(() => data.value?.task);
const activeTab = useHashTab("description", ["description", "members"]);
const changingStatus = ref(false);
const changingMembers = ref(false);
const selectedMembers = ref<UserSummary[]>([]);
const requestError = shallowRef<unknown>(null);
const taskMemberRoles = [{ label: "Assignee", value: "assignee" }];
const taskMemberIds = computed(() => task.value?.members.map((member) => member.userId) ?? []);

async function changeStatus(status: TaskStatus) {
  if (!task.value || changingStatus.value) return;
  const copy =
    status === "in_review"
      ? {
          title: "Submit task for review?",
          message: "Project editing will be locked until a reviewer returns or completes this task.",
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
  }).then(() => true, () => false);
  if (!confirmed) return;

  changingStatus.value = true;
  try {
    const endpoint: string = `/api/tasks/${encodeURIComponent(task.value.id)}/status`;
    data.value = await $fetch<{ task: TaskView; actions: TaskActions }>(
      endpoint,
      { method: "PATCH", body: { status } },
    );
    requestError.value = null;
    ElMessage.success(`Task is now ${taskStatusLabel(status)}`);
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The task status could not be changed."));
  } finally {
    changingStatus.value = false;
  }
}

async function addTaskMembers() {
  if (!task.value || !data.value?.actions.manageMembers || !selectedMembers.value.length) return;
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
  if (!task.value || !data.value?.actions.manageMembers) return;
  const confirmed = await ElMessageBox.confirm(
    `Remove ${member.displayName} from this task?`,
    "Remove task member",
    { type: "warning", confirmButtonText: "Remove" },
  ).then(() => true, () => false);
  if (!confirmed) return;
  changingMembers.value = true;
  try {
    await $fetch(
      `/api/tasks/${encodeURIComponent(task.value.id)}/members/${encodeURIComponent(member.userId)}`,
      { method: "DELETE" },
    );
    task.value.members = task.value.members.filter((candidate) => candidate.userId !== member.userId);
    requestError.value = null;
    ElMessage.success("Task member removed");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The task member could not be removed."));
  } finally {
    changingMembers.value = false;
  }
}
</script>

<template>
  <section v-loading="pending">
    <BackendErrorDetails v-if="error || requestError" :error="requestError || error" />

    <template v-if="task">
      <header class="page-header task-header">
        <div>
          <el-link :underline="false" href="/tasks">Tasks</el-link>
          <h1>{{ task.title }}</h1>
          <el-tag
            :type="task.status === 'done' ? 'success' : task.status === 'in_review' ? 'warning' : 'info'"
          >
            {{ taskStatusLabel(task.status) }}
          </el-tag>
          <div v-if="task.tags.length" class="task-tags" aria-label="Task tags">
            <el-tag
              v-for="tag in task.tags"
              :key="tag.name"
              effect="plain"
              size="small"
            >
              <span
                class="task-tag__color"
                :style="{ backgroundColor: tagColorValue(tag.color) }"
              />
              {{ tag.name }}
            </el-tag>
          </div>
        </div>
        <div class="task-actions">
          <el-button
            v-if="data?.actions.submitForReview"
            type="primary"
            :loading="changingStatus"
            @click="changeStatus('in_review')"
          >
            Submit for review
          </el-button>
          <template v-if="data?.actions.review">
            <el-button :disabled="changingStatus" @click="changeStatus('todo')">
              Return to do
            </el-button>
            <el-button type="success" :loading="changingStatus" @click="changeStatus('done')">
              Complete
            </el-button>
          </template>
          <el-button tag="a" :href="`/projects/${encodeURIComponent(task.projectId)}`">
            View project
          </el-button>
        </div>
      </header>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="Description" name="description">
          <div class="description-panel">
            <MarkdownContent :source="task.description" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="Members" name="members">
          <div class="task-members">
            <div v-if="data?.actions.manageMembers" class="task-members__add">
              <UsersInput
                v-model="selectedMembers"
                :exclude-ids="taskMemberIds"
                :project-id="task.projectId"
                placeholder="Search project members to assign"
              />
              <el-button
                type="primary"
                :loading="changingMembers"
                :disabled="!selectedMembers.length"
                @click="addTaskMembers"
              >
                Add members
              </el-button>
            </div>
            <UserGroupViewer
              :users="task.members"
              :roles="taskMemberRoles"
              :removable="data?.actions.manageMembers"
              :loading="changingMembers"
              empty-text="No task members"
              @remove="removeTaskMember"
            />
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

.task-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.task-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.task-tags :deep(.el-tag__content) {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.task-tag__color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.description-panel {
  min-height: 180px;
  padding-top: 8px;
}

.task-members {
  padding-top: 8px;
}

.task-members__add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  margin-bottom: 18px;
}

@media (max-width: 700px) {
  .task-header {
    align-items: stretch;
    flex-direction: column;
  }

  .task-members__add {
    grid-template-columns: 1fr;
  }

}
</style>
