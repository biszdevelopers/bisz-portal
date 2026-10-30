<script setup lang="ts">
import { Delete, Loading } from "@element-plus/icons-vue";
import type { InputTagInstance } from "element-plus";
import type { TagColor, TagView } from "~/shared/contracts";
import { tagNameSchema } from "~/shared/contracts";
import { tagColorOptions, tagColorValue } from "~/utils/tags";

type Size = "large" | "default" | "small";
type TagSearchResponse = {
  tags: TagView[];
  hasMore: boolean;
  status: number;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string[];
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    clearable?: boolean;
    size?: Size;
    max?: number;
    collapseTags?: boolean;
    collapseTagsTooltip?: boolean;
    maxCollapseTags?: number;
    debounceMs?: number;
    ariaLabel?: string;
  }>(),
  {
    modelValue: () => [],
    placeholder: "Add a tag",
    disabled: false,
    readonly: false,
    clearable: false,
    size: "default",
    collapseTags: false,
    collapseTagsTooltip: false,
    maxCollapseTags: 1,
    debounceMs: 250,
    ariaLabel: "Search and add tags",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
  change: [value: string[]];
  "add-tag": [value: string];
  "remove-tag": [value: string, index: number];
  clear: [];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const { capabilities } = usePortalAccess();
const requestFetch = useRequestFetch();
const inputTag = ref<InputTagInstance>();
const rawQuery = ref("");
const matches = ref<TagView[]>([]);
const tagMetadata = ref<Record<string, TagView>>({});
const menuVisible = ref(false);
const loading = ref(false);
const hasMore = ref(false);
const searchError = ref("");
const activeIndex = ref(-1);
const selectedColor = ref<TagColor>("blue");
const creating = ref(false);
const deleting = ref<Set<string>>(new Set());
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchVersion = 0;
let blurTimer: ReturnType<typeof setTimeout> | undefined;

const parsedQuery = computed(() => tagNameSchema.safeParse(rawQuery.value));
const normalizedQuery = computed(() =>
  parsedQuery.value.success ? parsedQuery.value.data : "",
);
const exactMatch = computed(() =>
  matches.value.find((tag) => tag.name === normalizedQuery.value),
);
const canMutate = computed(() => !props.disabled && !props.readonly);

function errorMessage(error: unknown, fallback: string) {
  if (typeof error !== "object" || error === null) return fallback;
  const data = "data" in error ? error.data : undefined;
  if (typeof data === "object" && data !== null) {
    const description = "error_description" in data
      ? data.error_description
      : undefined;
    if (typeof description === "string") return description;
  }
  return fallback;
}

function errorStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  if ("statusCode" in error && typeof error.statusCode === "number")
    return error.statusCode;
  if ("status" in error && typeof error.status === "number") return error.status;
  return undefined;
}

function rememberTags(tags: TagView[]) {
  const next = { ...tagMetadata.value };
  for (const tag of tags) next[tag.name] = tag;
  tagMetadata.value = next;
}

function updateModel(value: string[]) {
  emit("update:modelValue", value);
  emit("change", value);
}

async function resolveSelectedTags(names: string[]) {
  if (!capabilities.value.tagsRead || !names.length) return;
  const params = new URLSearchParams();
  for (const name of [...new Set(names)]) params.append("name", name);
  try {
    const response = await requestFetch<TagSearchResponse>(
      `/api/tags?${params.toString()}`,
    );
    rememberTags(response.tags);
  } catch {
    // Selection remains usable if metadata cannot be refreshed temporarily.
  }
}

watch(
  () => [capabilities.value.tagsRead, ...props.modelValue] as const,
  () => void resolveSelectedTags(props.modelValue),
  { immediate: true },
);

async function runSearch(version = ++searchVersion) {
  if (!rawQuery.value.trim()) {
    matches.value = [];
    hasMore.value = false;
    loading.value = false;
    searchError.value = "";
    activeIndex.value = -1;
    return;
  }
  menuVisible.value = true;
  if (!capabilities.value.tagsRead) {
    matches.value = [];
    loading.value = false;
    searchError.value = "You need BiszPortal.Tags.read to search tags.";
    return;
  }
  if (!parsedQuery.value.success) {
    matches.value = [];
    loading.value = false;
    searchError.value = parsedQuery.value.error.issues[0]?.message ??
      "Invalid tag name";
    activeIndex.value = -1;
    return;
  }

  loading.value = true;
  searchError.value = "";
  try {
    const response = await requestFetch<TagSearchResponse>("/api/tags", {
      query: { q: normalizedQuery.value },
    });
    if (version !== searchVersion) return;
    matches.value = response.tags;
    hasMore.value = response.hasMore;
    rememberTags(response.tags);
    activeIndex.value = response.tags.length ? 0 : -1;
  } catch (error) {
    if (version !== searchVersion) return;
    matches.value = [];
    hasMore.value = false;
    activeIndex.value = -1;
    searchError.value = errorMessage(error, "Unable to search tags.");
  } finally {
    if (version === searchVersion) loading.value = false;
  }
}

function scheduleSearch(value: string) {
  rawQuery.value = value;
  menuVisible.value = Boolean(value.trim());
  const version = ++searchVersion;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runSearch(version), props.debounceMs);
}

function resetInput() {
  rawQuery.value = "";
  matches.value = [];
  hasMore.value = false;
  searchError.value = "";
  menuVisible.value = false;
  inputTag.value?.blur();
  nextTick(() => inputTag.value?.focus());
}

function selectTag(tag: TagView) {
  if (!canMutate.value) return;
  if (props.max !== undefined && props.modelValue.length >= props.max) return;
  rememberTags([tag]);
  if (!props.modelValue.includes(tag.name)) {
    updateModel([...props.modelValue, tag.name]);
    emit("add-tag", tag.name);
  }
  resetInput();
}

function handleModelUpdate(value?: string[]) {
  const requested = value ?? [];
  const allowed = requested.filter(
    (name) => props.modelValue.includes(name) || Boolean(tagMetadata.value[name]),
  );
  updateModel([...new Set(allowed)]);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || !rawQuery.value.trim()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    menuVisible.value = false;
    return;
  }
  if (event.key === "ArrowDown" && matches.value.length) {
    event.preventDefault();
    event.stopPropagation();
    activeIndex.value = (activeIndex.value + 1) % matches.value.length;
    return;
  }
  if (event.key === "ArrowUp" && matches.value.length) {
    event.preventDefault();
    event.stopPropagation();
    activeIndex.value =
      (activeIndex.value - 1 + matches.value.length) % matches.value.length;
    return;
  }
  if (event.key === "Enter" || event.key === "NumpadEnter") {
    event.preventDefault();
    event.stopPropagation();
    const highlighted = matches.value[activeIndex.value];
    const selection = highlighted ?? exactMatch.value;
    if (selection) selectTag(selection);
  }
}

function handleFocus(event: FocusEvent) {
  if (blurTimer) clearTimeout(blurTimer);
  if (rawQuery.value.trim()) menuVisible.value = true;
  emit("focus", event);
}

function handleBlur(event: FocusEvent) {
  blurTimer = setTimeout(() => {
    menuVisible.value = false;
  }, 180);
  emit("blur", event);
}

async function createTag() {
  if (
    !capabilities.value.tagsCreate ||
    !parsedQuery.value.success ||
    exactMatch.value ||
    creating.value
  ) return;
  creating.value = true;
  searchError.value = "";
  try {
    const response = await requestFetch<{ tag: TagView }>("/api/tags", {
      method: "POST",
      body: { name: normalizedQuery.value, color: selectedColor.value },
    });
    rememberTags([response.tag]);
    await runSearch();
    activeIndex.value = matches.value.findIndex(
      (tag) => tag.name === response.tag.name,
    );
    ElMessage.success(`Created tag ${response.tag.name}`);
  } catch (error) {
    if (errorStatus(error) === 409) {
      await runSearch();
      ElMessage.info("That tag already exists and is now available to select.");
    } else {
      searchError.value = errorMessage(error, "Unable to create tag.");
    }
  } finally {
    creating.value = false;
  }
}

async function deleteTag(tag: TagView) {
  if (!capabilities.value.tagsDelete || deleting.value.has(tag.name)) return;
  try {
    await ElMessageBox.confirm(
      `Delete the tag “${tag.name}”?`,
      "Delete tag",
      {
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
        type: "warning",
      },
    );
  } catch {
    return;
  }

  deleting.value = new Set([...deleting.value, tag.name]);
  try {
    await requestFetch("/api/tags", {
      method: "DELETE",
      body: { name: tag.name },
    });
    const nextMetadata = { ...tagMetadata.value };
    delete nextMetadata[tag.name];
    tagMetadata.value = nextMetadata;
    if (props.modelValue.includes(tag.name)) {
      updateModel(props.modelValue.filter((name) => name !== tag.name));
    }
    await runSearch();
    ElMessage.success(`Deleted tag ${tag.name}`);
  } catch (error) {
    searchError.value = errorMessage(error, "Unable to delete tag.");
  } finally {
    const next = new Set(deleting.value);
    next.delete(tag.name);
    deleting.value = next;
  }
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (blurTimer) clearTimeout(blurTimer);
  searchVersion += 1;
});
</script>

<template>
  <el-popover
    :visible="menuVisible"
    placement="bottom-start"
    :width="360"
    :show-arrow="false"
    popper-class="shared-input-tag-popper"
    :popper-style="{ maxWidth: 'calc(100vw - 32px)', padding: '0' }"
  >
    <template #reference>
      <div class="shared-input-tag" @keydown.capture="handleKeydown">
        <el-input-tag
          ref="inputTag"
          :model-value="modelValue"
          :placeholder="placeholder"
          :disabled="disabled"
          :readonly="readonly"
          :clearable="clearable"
          :size="size"
          :max="max"
          :collapse-tags="collapseTags"
          :collapse-tags-tooltip="collapseTagsTooltip"
          :max-collapse-tags="maxCollapseTags"
          :save-on-blur="false"
          :aria-label="ariaLabel"
          @input="scheduleSearch"
          @update:model-value="handleModelUpdate"
          @remove-tag="(value, index) => emit('remove-tag', value, index)"
          @clear="emit('clear')"
          @focus="handleFocus"
          @blur="handleBlur"
        >
          <template #tag="{ value }">
            <span class="shared-input-tag__selected">
              <span
                class="shared-input-tag__swatch"
                :style="{
                  backgroundColor: tagColorValue(
                    tagMetadata[value]?.color ?? 'gray',
                  ),
                }"
              />
              {{ value }}
            </span>
          </template>
        </el-input-tag>
      </div>
    </template>

    <div
      class="shared-input-tag__menu"
      style="height: 280px"
      role="listbox"
      aria-label="Matching tags"
    >
      <div v-if="loading" class="shared-input-tag__state">
        <el-icon class="is-loading"><Loading /></el-icon>
        Searching tags…
      </div>
      <div v-else-if="searchError" class="shared-input-tag__state is-error">
        {{ searchError }}
      </div>
      <template v-else>
        <div v-if="matches.length" class="shared-input-tag__matches">
          <div
            v-for="(tag, index) in matches"
            :key="tag.name"
            class="shared-input-tag__option"
            :class="{ 'is-active': index === activeIndex }"
            role="option"
            tabindex="-1"
            :aria-selected="index === activeIndex"
            @mousedown.prevent
            @click="selectTag(tag)"
            @mouseenter="activeIndex = index"
          >
            <span
              class="shared-input-tag__color"
              :style="{ backgroundColor: tagColorValue(tag.color) }"
            />
            <span class="shared-input-tag__name">{{ tag.name }}</span>
            <el-button
              v-if="capabilities.tagsDelete"
              text
              circle
              size="small"
              type="danger"
              :loading="deleting.has(tag.name)"
              :aria-label="`Delete ${tag.name}`"
              @mousedown.prevent.stop
              @click.prevent.stop="deleteTag(tag)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <p v-if="hasMore" class="shared-input-tag__hint">
            More matches exist. Refine your search to narrow the list.
          </p>
        </div>
        <div v-else class="shared-input-tag__state">No matching tags.</div>

        <div v-if="parsedQuery.success && !exactMatch" class="shared-input-tag__create">
          <p>“{{ normalizedQuery }}” does not exist.</p>
          <template v-if="capabilities.tagsCreate && canMutate">
            <div class="shared-input-tag__colors" aria-label="Tag color">
              <button
                v-for="option in tagColorOptions"
                :key="option.value"
                type="button"
                class="shared-input-tag__color-choice"
                :class="{ 'is-selected': selectedColor === option.value }"
                :style="{ backgroundColor: option.color }"
                :aria-label="option.label"
                :aria-pressed="selectedColor === option.value"
                @mousedown.prevent
                @click="selectedColor = option.value"
              />
            </div>
            <el-button
              type="primary"
              size="small"
              :loading="creating"
              @mousedown.prevent
              @click="createTag"
            >
              Create tag
            </el-button>
          </template>
        </div>
      </template>
    </div>
  </el-popover>
</template>

<style scoped>
.shared-input-tag {
  width: 100%;
}

.shared-input-tag__selected {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.shared-input-tag__swatch,
.shared-input-tag__color {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.shared-input-tag__menu {
  width: 100%;
  height: 280px;
  overflow-y: auto;
  padding: 8px;
}

.shared-input-tag__state {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: center;
}

.shared-input-tag__state.is-error {
  color: var(--el-color-danger);
}

.shared-input-tag__matches {
  display: grid;
  gap: 4px;
}

.shared-input-tag__option {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 4px 6px 4px 10px;
  border: 0;
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-primary);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.shared-input-tag__option:hover,
.shared-input-tag__option.is-active {
  background: var(--el-fill-color-light);
}

.shared-input-tag__option:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.shared-input-tag__name {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.shared-input-tag__hint {
  margin: 6px 4px 2px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.shared-input-tag__create {
  display: grid;
  gap: 10px;
  margin-top: 8px;
  padding: 12px 8px 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.shared-input-tag__create p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.shared-input-tag__colors {
  display: flex;
  gap: 8px;
  align-items: center;
}

.shared-input-tag__color-choice {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--el-border-color);
  cursor: pointer;
}

.shared-input-tag__color-choice.is-selected {
  border-color: var(--el-bg-color-overlay);
  box-shadow: 0 0 0 2px var(--el-color-primary);
}

@media (max-width: 392px) {
  .shared-input-tag__menu {
    width: calc(100vw - 32px);
  }
}
</style>
