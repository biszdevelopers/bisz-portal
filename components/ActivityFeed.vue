<script setup lang="ts">
import { NuxtLink } from "#components";
import type { ActivityPage, ActivityView } from "~/shared/contracts";
import { timeAgo } from "~/utils/format";

const props = withDefaults(
  defineProps<{
    projectId?: string | null;
    taskId?: string | null;
    incidentId?: string | null;
    limit?: number;
    compact?: boolean;
    global?: boolean;
  }>(),
  {
    projectId: null,
    taskId: null,
    incidentId: null,
    limit: 20,
    compact: false,
    global: false,
  },
);

const items = ref<ActivityView[]>([]);
const loading = ref(false);
const error = ref("");
const nextCursor = ref<string | null>(null);

function label(event: ActivityView) {
  const actor = event.actor?.displayName ?? "Someone";
  const title =
    typeof event.metadata.title === "string" ? `“${event.metadata.title}”` : "";
  switch (event.type) {
    case "project_created":
      return `${actor} created the project`;
    case "project_updated":
      return `${actor} updated the project`;
    case "project_archived":
      return `${actor} archived the project`;
    case "project_unarchived":
      return `${actor} unarchived the project`;
    case "member_added":
      return `${actor} added a member`;
    case "member_removed":
      return `${actor} removed a member`;
    case "member_permissions_changed":
      return `${actor} changed member permissions`;
    case "task_created":
      return `${actor} created task ${title}`;
    case "task_updated":
      return `${actor} updated task ${title}`;
    case "task_status_changed":
      return `${actor} moved ${title} from ${String(event.metadata.from ?? "?")} to ${String(event.metadata.to ?? "?")}`;
    case "task_deleted":
      return `${actor} deleted task ${title}`;
    case "task_duplicated":
      return `${actor} duplicated a task into ${title}`;
    case "task_members_added":
      return `${actor} assigned someone to ${title}`;
    case "task_members_removed":
      return `${actor} unassigned someone from ${title}`;
    case "task_tags_changed":
      return `${actor} changed tags on ${title}`;
    case "incident_created":
      return `${actor} reported incident ${title}`;
    case "incident_updated":
      return `${actor} updated incident ${title}`;
    case "incident_status_changed":
      return `${actor} changed incident status`;
    case "incident_assigned":
      return `${actor} assigned incident ${title}`;
    case "incident_resolved":
      return `${actor} resolved incident ${title}`;
    case "comment_created":
      return `${actor} commented`;
    case "comment_updated":
      return `${actor} edited a comment`;
    case "comment_deleted":
      return `${actor} deleted a comment`;
    case "template_created":
      return `${actor} created a task template`;
    case "asset_link_repaired":
      return `${actor} repaired the Assets link`;
    default:
      return `${actor} updated the workspace`;
  }
}

function linkFor(event: ActivityView) {
  if (event.commentId) {
    if (event.taskId) return `/tasks/${event.taskId}#comment-${event.commentId}`;
    if (event.incidentId)
      return `/incidents/${event.incidentId}#comment-${event.commentId}`;
    if (event.projectId)
      return `/projects/${event.projectId}#comment-${event.commentId}`;
  }
  if (event.taskId) return `/tasks/${event.taskId}`;
  if (event.incidentId) return `/incidents/${event.incidentId}`;
  return null;
}

async function load(reset = true) {
  if (!props.global && !props.projectId && !props.taskId && !props.incidentId) {
    items.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const page = await $fetch<ActivityPage>("/api/activity", {
      query: {
        limit: props.limit,
        ...(props.projectId && !props.taskId && !props.incidentId && !props.global
          ? { projectId: props.projectId }
          : {}),
        ...(props.taskId ? { taskId: props.taskId } : {}),
        ...(props.incidentId ? { incidentId: props.incidentId } : {}),
        ...(!reset && nextCursor.value ? { cursor: nextCursor.value } : {}),
      },
    });
    items.value = reset ? page.activity : [...items.value, ...page.activity];
    nextCursor.value = page.nextCursor;
  } catch (caught) {
    error.value = backendErrorMessage(caught, "Activity could not be loaded.");
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load(true));
watch(
  () => [props.projectId, props.taskId, props.incidentId],
  () => void load(true),
);
defineExpose({ refresh: () => load(true) });
</script>

<template>
  <section class="activity-feed" :class="{ 'is-compact': compact }">
    <p v-if="error" class="activity-feed__error">{{ error }}</p>
    <ol v-else-if="items.length" class="activity-feed__list">
      <li v-for="event in items" :key="event.id" class="activity-feed__item">
        <span class="activity-feed__dot" aria-hidden="true" />
        <div>
          <component
            :is="linkFor(event) ? NuxtLink : 'span'"
            :to="linkFor(event) ?? undefined"
            class="activity-feed__label"
          >
            {{ label(event) }}
          </component>
          <small>{{ timeAgo(event.createdAt) }}</small>
        </div>
      </li>
    </ol>
    <p v-else-if="!loading" class="activity-feed__empty">No activity yet.</p>
    <el-button
      v-if="nextCursor"
      text
      size="small"
      :loading="loading"
      @click="load(false)"
      >Load older activity</el-button
    >
  </section>
</template>

<style scoped>
.activity-feed__list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity-feed__item {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.activity-feed__dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  background: var(--accent);
  border-radius: 50%;
}

.activity-feed__item div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.activity-feed__label {
  font-size: 13px;
  line-height: 1.45;
}

.activity-feed__item a {
  color: var(--text-primary);
  text-decoration: none;
}

.activity-feed__item a:hover {
  color: var(--accent);
}

.activity-feed__item small,
.activity-feed__empty {
  color: var(--text-muted);
  font-size: 11px;
}

.activity-feed__error {
  color: var(--status-danger);
  font-size: 12px;
}

.is-compact .activity-feed__list {
  gap: 8px;
}
</style>
