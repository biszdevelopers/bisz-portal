<script setup lang="ts">
import { ChatDotRound, Delete, EditPen } from "@element-plus/icons-vue";
import type {
  CommentPage,
  CommentView,
  UserSummary,
} from "~/shared/contracts";
import { initials, timeAgo } from "~/utils/format";

const props = withDefaults(
  defineProps<{
    projectId?: string | null;
    taskId?: string | null;
    incidentId?: string | null;
    canWrite?: boolean;
    title?: string;
  }>(),
  {
    projectId: null,
    taskId: null,
    incidentId: null,
    canWrite: false,
    title: "Comments",
  },
);

const items = ref<CommentView[]>([]);
const loading = ref(false);
const sending = ref(false);
const error = ref("");
const nextCursor = ref<string | null>(null);
const body = ref("");
const editingId = ref<string | null>(null);
const editingBody = ref("");
const mentionIds = ref<string[]>([]);
const selectedMentionUsers = ref<UserSummary[]>([]);
const mentionOpen = ref(false);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

const hostQuery = computed(() => ({
  ...(props.projectId && !props.taskId && !props.incidentId
    ? { projectId: props.projectId }
    : {}),
  ...(props.taskId ? { taskId: props.taskId } : {}),
  ...(props.incidentId ? { incidentId: props.incidentId } : {}),
}));
const mentionProjectId = computed(() =>
  props.taskId || props.incidentId ? undefined : props.projectId ?? undefined,
);

async function load(reset = true) {
  loading.value = true;
  error.value = "";
  try {
    const page = await $fetch<CommentPage>("/api/comments", {
      query: {
        ...hostQuery.value,
        limit: 30,
        ...(!reset && nextCursor.value ? { cursor: nextCursor.value } : {}),
      },
    });
    items.value = reset ? page.comments : [...items.value, ...page.comments];
    nextCursor.value = page.nextCursor;
    await nextTick();
    const hash = window.location.hash;
    if (hash.startsWith("#comment-")) {
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  } catch (caught) {
    error.value = backendErrorMessage(caught, "Comments could not be loaded.");
  } finally {
    loading.value = false;
  }
}

watch(selectedMentionUsers, (users) => {
  if (!users.length) return;
  const additions = users.filter((user) => !mentionIds.value.includes(user.id));
  if (!additions.length) return;
  for (const user of additions) {
    body.value = `${body.value}${body.value.endsWith(" ") || !body.value ? "" : " "}@${user.displayName} `;
    mentionIds.value.push(user.id);
  }
  selectedMentionUsers.value = [];
});

async function submit() {
  if (!props.canWrite || sending.value || !body.value.trim()) return;
  sending.value = true;
  try {
    await $fetch("/api/comments", {
      method: "POST",
      body: { ...hostQuery.value, body: body.value, mentionIds: mentionIds.value },
    });
    body.value = "";
    mentionIds.value = [];
    await load(true);
    emit("changed");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The comment could not be posted."));
  } finally {
    sending.value = false;
  }
}

function startEdit(comment: CommentView) {
  editingId.value = comment.id;
  editingBody.value = comment.body;
}

async function saveEdit() {
  if (!editingId.value || !editingBody.value.trim()) return;
  try {
    await $fetch(`/api/comments/${encodeURIComponent(editingId.value)}`, {
      method: "PATCH",
      body: { body: editingBody.value },
    });
    editingId.value = null;
    editingBody.value = "";
    await load(true);
    emit("changed");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The comment could not be saved."));
  }
}

async function removeComment(comment: CommentView) {
  const confirmed = await ElMessageBox.confirm(
    "Delete this comment?",
    "Delete comment",
    { type: "warning", confirmButtonText: "Delete" },
  ).then(
    () => true,
    () => false,
  );
  if (!confirmed) return;
  try {
    await $fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
      method: "DELETE",
    });
    await load(true);
    emit("changed");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "The comment could not be deleted."));
  }
}

const emit = defineEmits<{ changed: [] }>();

onMounted(() => void load(true));
watch(hostQuery, () => void load(true));
onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer);
});
</script>

<template>
  <section class="comment-thread">
    <header class="comment-thread__header">
      <h2>
        <el-icon><ChatDotRound /></el-icon>
        {{ title }}
      </h2>
      <span v-if="items.length" class="muted">{{ items.length }} shown</span>
    </header>

    <p v-if="error" class="comment-thread__error">{{ error }}</p>
    <div v-loading="loading" class="comment-thread__list">
      <article
        v-for="comment in items"
        :id="`comment-${comment.id}`"
        :key="comment.id"
        class="comment"
        :class="{ 'is-deleted': comment.deleted }"
      >
        <el-avatar :size="32" :src="comment.author?.image ?? undefined">
          {{ initials(comment.author?.displayName) }}
        </el-avatar>
        <div class="comment__body">
          <header>
            <strong>{{ comment.author?.displayName ?? "Basis user" }}</strong>
            <small>{{ timeAgo(comment.createdAt) }}</small>
            <el-tag v-if="comment.editedAt" size="small" type="info">edited</el-tag>
            <span class="comment__actions">
              <el-button
                v-if="comment.canEdit && editingId !== comment.id"
                text
                size="small"
                :icon="EditPen"
                aria-label="Edit comment"
                @click="startEdit(comment)"
              />
              <el-button
                v-if="comment.canDelete"
                text
                size="small"
                type="danger"
                :icon="Delete"
                aria-label="Delete comment"
                @click="removeComment(comment)"
              />
            </span>
          </header>
          <template v-if="editingId === comment.id">
            <MarkdownEditor v-model="editingBody" :maxlength="20_000" />
            <div class="comment__edit-actions">
              <el-button size="small" @click="editingId = null">Cancel</el-button>
              <el-button size="small" type="primary" @click="saveEdit">Save</el-button>
            </div>
          </template>
          <p v-else-if="comment.deleted" class="comment__deleted">This comment was deleted.</p>
          <MarkdownContent v-else :source="comment.body" />
          <div v-if="comment.mentions.length" class="comment__mentions">
            <span v-for="mention in comment.mentions" :key="mention.id" class="comment__mention">
              @{{ mention.displayName }}
            </span>
          </div>
        </div>
      </article>
      <p v-if="!items.length && !loading" class="comment-thread__empty">
        No comments yet. Start the conversation.
      </p>
    </div>
    <el-button
      v-if="nextCursor"
      text
      size="small"
      :loading="loading"
      @click="load(false)"
      >Load older comments</el-button
    >

    <div v-if="canWrite" class="comment-composer">
      <MarkdownEditor
        v-model="body"
        :maxlength="20_000"
        placeholder="Write a comment. Markdown is supported."
      />
      <div class="comment-composer__actions">
        <el-popover v-model:visible="mentionOpen" trigger="click" :width="320">
          <template #reference>
            <el-button text size="small">@ Mention</el-button>
          </template>
          <UsersInput
            v-model="selectedMentionUsers"
            :project-id="mentionProjectId"
            placeholder="Search people to mention"
          />
        </el-popover>
        <span class="muted">{{ mentionIds.length }} mentioned</span>
        <el-button
          type="primary"
          :loading="sending"
          :disabled="!body.trim()"
          @click="submit"
          >Comment</el-button
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.comment-thread {
  display: grid;
  gap: 14px;
}

.comment-thread__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.comment-thread__header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.comment-thread__list {
  display: grid;
  gap: 14px;
  min-height: 40px;
}

.comment {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
}

.comment__body {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  background: var(--surface-subtle);
  border-radius: var(--radius-sm);
}

.comment__body header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.comment__body header strong {
  font-size: 13px;
}

.comment__body header small {
  color: var(--text-muted);
  font-size: 11px;
}

.comment__actions {
  margin-left: auto;
}

.comment__deleted {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  font-style: italic;
}

.comment__mentions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.comment__mention {
  padding: 1px 6px;
  color: var(--accent);
  font-size: 11px;
  background: var(--el-color-primary-light-9);
  border-radius: var(--radius-pill);
}

.comment__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.comment__error,
.comment-thread__error {
  margin: 0;
  color: var(--status-danger);
  font-size: 12px;
}

.comment-thread__empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.comment-composer {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.comment-composer__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .comment {
    grid-template-columns: 1fr;
  }

  .comment > .el-avatar {
    display: none;
  }

  .comment-composer__actions {
    flex-wrap: wrap;
  }
}
</style>
