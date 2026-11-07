<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import {
  localDateOnly,
  type ProjectSummary,
  type TaskView,
  type UserSummary,
} from "~/shared/contracts";

type ProjectDetail = ProjectSummary & { tasks: TaskView[] };

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ project: ProjectDetail }>(
  () => `/api/projects/${encodeURIComponent(projectId.value)}`,
  { headers },
);
const project = computed(() => data.value?.project);
const formRef = ref<FormInstance>();
const submitting = ref(false);
const requestError = shallowRef<unknown>(null);
const selectedMembers = ref<UserSummary[]>([]);
const form = reactive({
  title: "",
  description: "",
  dueDate: null as string | null,
  tags: [] as string[],
});

function validateDueDate(
  _rule: unknown,
  value: string | null,
  callback: (error?: Error) => void,
) {
  callback(
    value && value < localDateOnly()
      ? new Error("Due date cannot be in the past")
      : undefined,
  );
}

const rules: FormRules<typeof form> = {
  title: [
    { required: true, whitespace: true, message: "Enter a task title", trigger: "blur" },
    { max: 120, message: "Use 120 characters or fewer", trigger: "blur" },
  ],
  dueDate: [{ validator: validateDueDate, trigger: "change" }],
};

const canCreate = computed(
  () =>
    Boolean(project.value?.capabilities.createTasks) &&
    project.value?.status === "active" &&
    !project.value?.reviewLocked,
);

function disablePastDueDates(value: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return value.getTime() < today.getTime();
}

async function createTask() {
  if (!canCreate.value || submitting.value) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    const response = await $fetch<{ task: TaskView }>(
      `/api/projects/${encodeURIComponent(projectId.value)}/tasks`,
      {
        method: "POST",
        body: {
          ...form,
          memberIds: selectedMembers.value.map((user) => user.id),
        },
      },
    );
    requestError.value = null;
    ElMessage.success("Task created");
    await navigateTo(`/tasks/${encodeURIComponent(response.task.id)}`);
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The task could not be created."));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section v-loading="pending">
    <header class="page-header">
      <el-link
        :underline="false"
        :href="`/projects/${encodeURIComponent(projectId)}#tasks`"
      >
        {{ project?.name ?? "Project" }} tasks
      </el-link>
      <h1>Create a task</h1>
      <p>Create and assign work for this project.</p>
    </header>

    <BackendErrorDetails
      v-if="error || requestError"
      :error="requestError || error"
    />
    <AccessDenied
      v-else-if="project && !canCreate"
      title="Task creation unavailable"
      description="You cannot create tasks while this project is archived or in review, or without task creation access."
    />

    <el-form
      v-else-if="project"
      ref="formRef"
      class="task-create-form"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="createTask"
    >
      <el-form-item label="Project">
        <el-input :model-value="project.name" disabled />
      </el-form-item>
      <el-form-item label="Title" prop="title">
        <el-input v-model="form.title" maxlength="120" show-word-limit autofocus />
      </el-form-item>
      <el-form-item label="Members">
        <UsersInput
          v-model="selectedMembers"
          :project-id="projectId"
          placeholder="Search project members to assign"
        />
      </el-form-item>
      <el-form-item label="Tags" prop="tags">
        <SharedInputTag
          v-model="form.tags"
          :max="20"
          clearable
          placeholder="Search for a tag"
        />
      </el-form-item>
      <el-form-item label="Description" prop="description">
        <MarkdownEditor v-model="form.description" :maxlength="50_000" />
      </el-form-item>
      <el-form-item label="Due date" prop="dueDate">
        <el-date-picker
          v-model="form.dueDate"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled-date="disablePastDueDates"
          placeholder="No due date"
          clearable
        />
      </el-form-item>
      <div class="form-actions">
        <el-button
          tag="a"
          :href="`/projects/${encodeURIComponent(projectId)}#tasks`"
          :disabled="submitting"
        >
          Cancel
        </el-button>
        <el-button type="primary" native-type="submit" :loading="submitting">
          Create task
        </el-button>
      </div>
    </el-form>
  </section>
</template>

<style scoped>
.task-create-form {
  max-width: 920px;
}

.task-create-form :deep(.el-date-editor.el-input) {
  width: 100%;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

@media (max-width: 600px) {
  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .el-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
