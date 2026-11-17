<script setup lang="ts">
import { Delete, EditPen, Plus } from "@element-plus/icons-vue";
import type { TagColor } from "~/shared/contracts";
import { tagColorOptions, tagColorValue } from "~/utils/tags";

type ManagedTag = {
  name: string;
  color: TagColor;
  usageCount: number;
  createdAt: string;
};

const { capabilities, pending: accessPending, error: accessError } = usePortalAccess();
const tags = ref<ManagedTag[]>([]);
const loading = ref(false);
const error = shallowRef<unknown>(null);
const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<ManagedTag | null>(null);
const form = reactive<{ name: string; color: TagColor }>({ name: "", color: "blue" });
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const response = await $fetch<{ tags: ManagedTag[] }>("/api/tags/manage");
    tags.value = response.tags;
    error.value = null;
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.name = "";
  form.color = "blue";
  createOpen.value = true;
}

function openEdit(tag: ManagedTag) {
  editing.value = tag;
  form.name = tag.name;
  form.color = tag.color;
  editOpen.value = true;
}

async function createTag() {
  if (!form.name.trim() || saving.value) return;
  saving.value = true;
  try {
    await $fetch("/api/tags", {
      method: "POST",
      body: { name: form.name.trim(), color: form.color },
    });
    createOpen.value = false;
    await load();
    ElMessage.success("Tag created");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The tag could not be created."));
  } finally {
    saving.value = false;
  }
}

async function saveTag() {
  if (!editing.value || saving.value) return;
  saving.value = true;
  try {
    await $fetch(`/api/tags/${encodeURIComponent(editing.value.name)}`, {
      method: "PATCH",
      body: {
        color: form.color,
        ...(form.name.trim() !== editing.value.name ? { name: form.name.trim() } : {}),
      },
    });
    editOpen.value = false;
    await load();
    ElMessage.success("Tag updated");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The tag could not be updated."));
  } finally {
    saving.value = false;
  }
}

async function deleteTag(tag: ManagedTag) {
  const confirmed = await ElMessageBox.confirm(
    `Delete ${tag.name}? It will be removed from ${tag.usageCount} task${tag.usageCount === 1 ? "" : "s"}.`,
    "Delete tag",
    { type: "warning", confirmButtonText: "Delete" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  try {
    await $fetch("/api/tags", { method: "DELETE", body: { name: tag.name } });
    await load();
    ElMessage.success("Tag deleted");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The tag could not be deleted."));
  }
}

onMounted(load);
useHead({ title: "Tags · DevConnect" });
</script>

<template>
  <section class="page tags-page">
    <PageHeader title="Tags" description="Manage the shared tag vocabulary used by tasks.">
      <template #actions>
        <el-button v-if="capabilities.tagsCreate" type="primary" :icon="Plus" @click="openCreate">
          New tag
        </el-button>
      </template>
    </PageHeader>

    <AccessDenied
      v-if="!accessPending && !capabilities.tagsRead"
      description="You need BiszPortal.Tags.read to manage tags."
    />
    <BackendErrorDetails v-else-if="accessError || error" :error="accessError || error" />
    <template v-else>
      <el-card shadow="never" v-loading="loading">
        <el-table class="desktop-table" :data="tags" empty-text="No tags yet">
          <el-table-column label="Tag" min-width="220">
            <template #default="{ row }">
              <span class="tag-cell">
                <span class="tag-swatch" :style="{ backgroundColor: tagColorValue(row.color) }" />
                {{ row.name }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="Color" width="140">
            <template #default="{ row }">
              <el-select
                :model-value="row.color"
                :disabled="!capabilities.tagsCreate"
                @change="(value: TagColor) => {
                  row.color = value;
                  $fetch(`/api/tags/${encodeURIComponent(row.name)}`, { method: 'PATCH', body: { color: value } })
                    .then(() => ElMessage.success('Tag color updated'))
                    .catch((caught) => ElMessage.error(backendErrorMessage(caught, 'The color could not be saved.')));
                }"
              >
                <el-option v-for="option in tagColorOptions" :key="option.value" :label="option.label" :value="option.value">
                  <span class="tag-cell"><span class="tag-swatch" :style="{ backgroundColor: option.color }" />{{ option.label }}</span>
                </el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column prop="usageCount" label="Used by" width="110" align="right" />
          <el-table-column width="120" align="right" fixed="right">
            <template #default="{ row }">
              <el-button v-if="capabilities.tagsCreate" text :icon="EditPen" aria-label="Edit tag" @click="openEdit(row as ManagedTag)" />
              <el-button v-if="capabilities.tagsDelete" text type="danger" :icon="Delete" aria-label="Delete tag" @click="deleteTag(row as ManagedTag)" />
            </template>
          </el-table-column>
        </el-table>

        <div class="mobile-card-list">
          <article v-for="tag in tags" :key="tag.name" class="tag-card surface">
            <span class="tag-cell">
              <span class="tag-swatch" :style="{ backgroundColor: tagColorValue(tag.color) }" />
              <strong>{{ tag.name }}</strong>
            </span>
            <span class="muted">{{ tag.usageCount }} tasks</span>
            <div>
              <el-button v-if="capabilities.tagsCreate" text :icon="EditPen" aria-label="Edit tag" @click="openEdit(tag)" />
              <el-button v-if="capabilities.tagsDelete" text type="danger" :icon="Delete" aria-label="Delete tag" @click="deleteTag(tag)" />
            </div>
          </article>
        </div>
      </el-card>
    </template>

    <el-dialog v-model="createOpen" title="New tag" width="min(420px, 94vw)">
      <el-form label-position="top" @submit.prevent="createTag">
        <el-form-item label="Name"><el-input v-model="form.name" maxlength="64" /></el-form-item>
        <el-form-item label="Color">
          <el-select v-model="form.color">
            <el-option v-for="option in tagColorOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createOpen = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" :disabled="!form.name.trim()" @click="createTag">Create</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editOpen" title="Edit tag" width="min(420px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveTag">
        <el-form-item label="Name"><el-input v-model="form.name" maxlength="64" /></el-form-item>
        <el-form-item label="Color">
          <el-select v-model="form.color">
            <el-option v-for="option in tagColorOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editOpen = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" :disabled="!form.name.trim()" @click="saveTag">Save</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.tags-page {
  display: grid;
  gap: 16px;
}

.tag-cell {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.tag-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.tag-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
}

.tag-card .muted {
  font-size: 12px;
}

@media (min-width: 768px) {
  .mobile-card-list {
    display: none;
  }
}
</style>
