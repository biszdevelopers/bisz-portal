<script setup lang="ts">
import type { ProjectMemberView } from "~/shared/contracts";
import type { ProjectPermission } from "~/shared/permissions";

const props = defineProps<{
  modelValue: boolean;
  projectId: string;
  member: ProjectMemberView | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const selected = ref<ProjectPermission[]>([]);
const saving = ref(false);
const error = ref("");

const permissions: Array<{
  value: ProjectPermission;
  label: string;
  description: string;
}> = [
  { value: "project.read", label: "View project", description: "See the project and its overview." },
  { value: "project.update", label: "Edit project", description: "Change name, slug, description, and repository settings." },
  { value: "project.archive", label: "Archive project", description: "Archive or restore the project." },
  { value: "members.manage", label: "Manage members", description: "Add, remove, and change member permissions." },
  { value: "tasks.read", label: "View tasks", description: "See tasks and their comments." },
  { value: "tasks.write", label: "Create and edit tasks", description: "Create, edit, move, and delete tasks." },
  { value: "incidents.read", label: "View incidents", description: "See incidents and their comments." },
  { value: "incidents.write", label: "Create and edit incidents", description: "Report, assign, and resolve incidents." },
];

watch(
  () => [props.modelValue, props.member] as const,
  ([open, member]) => {
    if (!open || !member) return;
    selected.value = [...member.permissions];
    error.value = "";
  },
  { immediate: true },
);

async function save() {
  if (!props.member || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await $fetch(
      `/api/projects/${encodeURIComponent(props.projectId)}/members/${encodeURIComponent(props.member.userId)}`,
      { method: "PATCH", body: { permissions: selected.value } },
    );
    visible.value = false;
    emit("saved");
    ElMessage.success("Member permissions updated");
  } catch (caught) {
    error.value = backendErrorMessage(caught, "Permissions could not be saved.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`Permissions for ${member?.displayName ?? 'member'}`"
    width="min(560px, 94vw)"
  >
    <p v-if="member?.role === 'owner'" class="permission-owner">
      Project owners always have full access and cannot be edited.
    </p>
    <el-checkbox-group v-model="selected" class="permission-list" :disabled="member?.role === 'owner'">
      <label v-for="permission in permissions" :key="permission.value" class="permission-row">
        <el-checkbox :value="permission.value" />
        <span>
          <strong>{{ permission.label }}</strong>
          <small>{{ permission.description }}</small>
        </span>
      </label>
    </el-checkbox-group>
    <p v-if="error" class="permission-error">{{ error }}</p>
    <template #footer>
      <el-button @click="visible = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" :disabled="member?.role === 'owner'" @click="save">
        Save permissions
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.permission-owner {
  margin: 0 0 12px;
  color: var(--text-muted);
  font-size: 13px;
}

.permission-list {
  display: grid;
  gap: 6px;
}

.permission-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.permission-row span {
  display: grid;
  gap: 1px;
}

.permission-row strong {
  font-size: 13px;
  font-weight: 600;
}

.permission-row small {
  color: var(--text-muted);
  font-size: 11px;
}

.permission-error {
  margin: 10px 0 0;
  color: var(--status-danger);
  font-size: 12px;
}
</style>
