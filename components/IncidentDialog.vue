<script setup lang="ts">
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentView,
  UserSummary,
} from "~/shared/contracts";

const props = defineProps<{
  modelValue: boolean;
  incident?: IncidentView | null;
  projects: Array<{ id: string; name: string }>;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [incident: IncidentView];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const form = reactive({
  projectId: "",
  title: "",
  description: "",
  severity: "medium" as IncidentSeverity,
  status: "open" as IncidentStatus,
  dueDate: null as string | null,
});
const assignee = ref<UserSummary[]>([]);
const saving = ref(false);
const error = ref("");

watch(
  () => [props.modelValue, props.incident] as const,
  ([open, incident]) => {
    if (!open) return;
    error.value = "";
    form.projectId = incident?.projectId ?? props.projects[0]?.id ?? "";
    form.title = incident?.title ?? "";
    form.description = incident?.description ?? "";
    form.severity = incident?.severity ?? "medium";
    form.status = incident?.status ?? "open";
    form.dueDate = incident?.dueDate ?? null;
    assignee.value = incident?.assignee ? [incident.assignee] : [];
  },
  { immediate: true },
);

watch(
  () => form.projectId,
  () => {
    if (!props.incident) assignee.value = [];
  },
);

async function submit() {
  if (!form.projectId || !form.title.trim() || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const endpoint = props.incident
      ? `/api/incidents/${encodeURIComponent(props.incident.id)}`
      : "/api/incidents";
    const response = await $fetch<{ incident: IncidentView }>(endpoint, {
      method: props.incident ? "PATCH" : "POST",
      body: {
        ...(props.incident ? {} : { projectId: form.projectId }),
        title: form.title.trim(),
        description: form.description,
        severity: form.severity,
        status: form.status,
        dueDate: form.dueDate,
        assigneeId: assignee.value[0]?.id ?? null,
      },
    });
    visible.value = false;
    emit("saved", response.incident);
    ElMessage.success(props.incident ? "Incident updated" : "Incident created");
  } catch (caught) {
    error.value = backendErrorMessage(caught, "The incident could not be saved.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="incident ? 'Edit incident' : 'New incident'"
    width="min(640px, 94vw)"
  >
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="Project" required>
        <el-select
          v-model="form.projectId"
          :disabled="Boolean(incident)"
          filterable
          placeholder="Select a project"
        >
          <el-option
            v-for="project in projects"
            :key="project.id"
            :label="project.name"
            :value="project.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="Title" required>
        <el-input v-model="form.title" maxlength="160" show-word-limit autofocus />
      </el-form-item>
      <div class="incident-grid">
        <el-form-item label="Severity">
          <el-select v-model="form.severity">
            <el-option label="Low" value="low" />
            <el-option label="Medium" value="medium" />
            <el-option label="High" value="high" />
            <el-option label="Critical" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="Status">
          <el-select v-model="form.status">
            <el-option label="Open" value="open" />
            <el-option label="Investigating" value="investigating" />
            <el-option label="Resolved" value="resolved" />
          </el-select>
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
      </div>
      <el-form-item label="Assignee">
        <UsersInput
          v-model="assignee"
          :project-id="form.projectId || undefined"
          placeholder="Search project members"
        />
      </el-form-item>
      <el-form-item label="Description">
        <MarkdownEditor v-model="form.description" :maxlength="50_000" />
      </el-form-item>
      <p v-if="error" class="incident-error">{{ error }}</p>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ incident ? "Save incident" : "Create incident" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.incident-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.incident-grid :deep(.el-date-editor) {
  width: 100%;
}

.incident-error {
  margin: 0;
  color: var(--status-danger);
  font-size: 12px;
}

@media (max-width: 640px) {
  .incident-grid {
    grid-template-columns: 1fr;
  }
}
</style>
