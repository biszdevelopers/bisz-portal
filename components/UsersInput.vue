<script setup lang="ts">
import type { UserSummary } from "~/shared/contracts";

const props = withDefaults(
  defineProps<{
    modelValue: UserSummary[];
    excludeIds?: string[];
    disabled?: boolean;
    placeholder?: string;
    maximum?: number;
    projectId?: string;
  }>(),
  {
    excludeIds: () => [],
    disabled: false,
    placeholder: "Search users by name or email",
    maximum: 50,
  },
);

const emit = defineEmits<{
  "update:modelValue": [users: UserSummary[]];
}>();

const options = ref<UserSummary[]>([]);
const loading = ref(false);
const searchError = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
let request: AbortController | undefined;

const selectedIds = computed({
  get: () => props.modelValue.map((user) => user.id),
  set: (ids: string[]) => {
    const known = new Map(
      [...props.modelValue, ...options.value].map((user) => [user.id, user]),
    );
    emit(
      "update:modelValue",
      ids.flatMap((id) => (known.has(id) ? [known.get(id)!] : [])),
    );
  },
});

const availableOptions = computed(() => {
  const excluded = new Set(props.excludeIds);
  return [
    ...new Map(
      [...props.modelValue, ...options.value].map((user) => [user.id, user]),
    ).values(),
  ].filter((user) => !excluded.has(user.id));
});

function initials(user: UserSummary) {
  const source = user.displayName?.trim() || user.email;
  return source.slice(0, 2).toUpperCase();
}

function searchUsers(value: string) {
  if (timer) clearTimeout(timer);
  request?.abort();
  const query = value.trim();
  if (query.length < 2) {
    options.value = [];
    searchError.value = "";
    return;
  }
  timer = setTimeout(async () => {
    const current = new AbortController();
    request = current;
    loading.value = true;
    try {
      const response = await $fetch<{ users: UserSummary[] }>("/api/users", {
        query: {
          q: query,
          page: 1,
          pageSize: 20,
          ...(props.projectId ? { projectId: props.projectId } : {}),
        },
        signal: current.signal,
      });
      if (request !== current) return;
      options.value = response.users;
      searchError.value = "";
    } catch (caught) {
      if (current.signal.aborted) return;
      options.value = [];
      searchError.value = backendErrorMessage(
        caught,
        "Users could not be searched.",
      );
    } finally {
      if (request === current) {
        loading.value = false;
        request = undefined;
      }
    }
  }, 250);
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  request?.abort();
});
</script>

<template>
  <div class="users-input">
    <el-select
      v-model="selectedIds"
      multiple
      filterable
      remote
      reserve-keyword
      :remote-method="searchUsers"
      :loading="loading"
      :disabled="disabled"
      :multiple-limit="maximum"
      :placeholder="placeholder"
      no-data-text="No matching users"
      value-key="id"
    >
      <el-option
        v-for="user in availableOptions"
        :key="user.id"
        :label="user.displayName?.trim() || user.email"
        :value="user.id"
      >
        <div class="users-input__option">
          <el-avatar :size="28" :src="user.image || undefined">
            {{ initials(user) }}
          </el-avatar>
          <span>
            <strong>{{ user.displayName?.trim() || "Basis user" }}</strong>
            <small>{{ user.email }}</small>
          </span>
        </div>
      </el-option>
    </el-select>
    <p v-if="searchError" class="users-input__error" role="alert">
      {{ searchError }}
    </p>
  </div>
</template>

<style scoped>
.users-input,
.users-input .el-select {
  width: 100%;
}

.users-input__option {
  display: flex;
  align-items: center;
  gap: 10px;
}

.users-input__option > span {
  display: grid;
  line-height: 1.25;
}

.users-input__option small,
.users-input__help {
  color: var(--el-text-color-secondary);
}

.users-input__help,
.users-input__error {
  display: block;
  margin: 5px 0 0;
  font-size: 12px;
}

.users-input__error {
  color: var(--el-color-danger);
}
</style>
