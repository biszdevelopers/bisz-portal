<script setup lang="ts">
import { CollectionTag, Delete, Plus } from "@element-plus/icons-vue";
import type {
  SavedFilterScope,
  SavedFilterView,
} from "~/shared/contracts";

const props = defineProps<{
  scope: SavedFilterScope;
  currentQuery: Record<string, unknown>;
}>();
const emit = defineEmits<{
  apply: [query: Record<string, unknown>];
}>();

const filters = ref<SavedFilterView[]>([]);
const dialog = ref(false);
const name = ref("");
const saving = ref(false);
const error = ref("");

async function load() {
  try {
    const response = await $fetch<{ filters: SavedFilterView[] }>(
      "/api/saved-filters",
      { query: { scope: props.scope } },
    );
    filters.value = response.filters;
  } catch (caught) {
    error.value = backendErrorMessage(caught, "Saved filters could not be loaded.");
  }
}

function apply(filter: SavedFilterView) {
  emit("apply", filter.query);
}

async function save() {
  if (!name.value.trim() || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await $fetch("/api/saved-filters", {
      method: "POST",
      body: {
        scope: props.scope,
        name: name.value.trim(),
        query: props.currentQuery,
      },
    });
    dialog.value = false;
    name.value = "";
    await load();
    ElMessage.success("Filter saved");
  } catch (caught) {
    error.value = backendErrorMessage(caught, "The filter could not be saved.");
  } finally {
    saving.value = false;
  }
}

async function remove(filter: SavedFilterView) {
  try {
    await $fetch(`/api/saved-filters/${encodeURIComponent(filter.id)}`, {
      method: "DELETE",
    });
    await load();
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The filter could not be deleted."));
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="saved-filters">
    <el-icon class="saved-filters__icon"><CollectionTag /></el-icon>
    <button
      v-for="filter in filters"
      :key="filter.id"
      type="button"
      class="saved-filters__chip"
      @click="apply(filter)"
    >
      {{ filter.name }}
      <span
        class="saved-filters__remove"
        role="button"
        tabindex="0"
        :aria-label="`Delete ${filter.name}`"
        @click.stop="remove(filter)"
        @keydown.enter.stop="remove(filter)"
      >
        <el-icon><Delete /></el-icon>
      </span>
    </button>
    <el-button text size="small" :icon="Plus" @click="dialog = true">
      Save filter
    </el-button>
    <el-dialog v-model="dialog" title="Save current filter" width="min(420px, 94vw)">
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="Filter name">
          <el-input v-model="name" maxlength="40" show-word-limit autofocus />
        </el-form-item>
        <p v-if="error" class="saved-filters__error">{{ error }}</p>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" :disabled="!name.trim()" @click="save">
          Save
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.saved-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.saved-filters__icon {
  color: var(--text-muted);
}

.saved-filters__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.saved-filters__chip:hover {
  border-color: var(--accent);
}

.saved-filters__remove {
  display: inline-grid;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  font-size: 10px;
  border-radius: 50%;
  place-items: center;
}

.saved-filters__remove:hover {
  color: var(--status-danger);
  background: var(--el-color-danger-light-9);
}

.saved-filters__error {
  margin: 0;
  color: var(--status-danger);
  font-size: 12px;
}
</style>
