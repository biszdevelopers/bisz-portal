<script setup lang="ts">
import { MoreFilled, User } from "@element-plus/icons-vue";
import type { ProjectSummary } from "~/shared/contracts";

const props = defineProps<{ project: ProjectSummary }>();
const emit = defineEmits<{
  select: [project: ProjectSummary];
  archive: [project: ProjectSummary, archived: boolean];
}>();

const visibleMembers = computed(() => props.project.members.slice(0, 5));
const remainingMemberCount = computed(() =>
  Math.max(props.project.members.length - visibleMembers.value.length, 0),
);
const description = computed(() => {
  const plainText = props.project.description
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) return "No project description yet.";
  return plainText.length > 180
    ? `${plainText.slice(0, 177).trimEnd()}…`
    : plainText;
});
const progress = computed(() =>
  props.project.taskCount
    ? Math.round(
        (props.project.completedTaskCount / props.project.taskCount) * 100,
      )
    : 0,
);
const archived = computed(() => props.project.status === "archived");

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function onMenu(command: string) {
  if (command === "archive") emit("archive", props.project, !archived.value);
}
</script>

<template>
  <el-card
    class="project-card"
    :class="{ 'is-archived': archived }"
    shadow="never"
    role="button"
    tabindex="0"
    @click="emit('select', project)"
    @keydown.enter="emit('select', project)"
    @keydown.space.prevent="emit('select', project)"
  >
    <template #header>
      <div class="project-card__header">
        <div>
          <h2>{{ project.name }}</h2>
          <span class="project-card__slug">/projects/{{ project.slug }}</span>
        </div>
        <div class="project-card__header-actions" @click.stop>
          <el-tag v-if="archived" size="small" type="info">Archived</el-tag>
          <el-dropdown
            v-if="project.capabilities.archive"
            trigger="click"
            @command="onMenu"
          >
            <el-button text circle :icon="MoreFilled" aria-label="Project actions" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="archive">
                  {{ archived ? "Unarchive project" : "Archive project" }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </template>

    <p class="project-card__description">{{ description }}</p>

    <div class="project-card__stats">
      <span>{{ project.taskCount }} tasks</span>
      <span>{{ project.completedTaskCount }} done</span>
      <span>{{ project.memberCount }} members</span>
    </div>
    <el-progress
      :percentage="progress"
      :stroke-width="5"
      :show-text="false"
      :status="progress === 100 ? 'success' : undefined"
    />

    <template #footer>
      <div class="project-card__footer">
        <div
          v-if="project.members.length"
          class="avatar-group"
          :aria-label="`${project.members.length} assigned users`"
        >
          <el-tooltip
            v-for="member in visibleMembers"
            :key="member.userId"
            :content="member.displayName"
            placement="top"
          >
            <el-avatar
              :size="28"
              :src="member.image || undefined"
              class="avatar-group__avatar"
            >
              <span v-if="!member.image">{{ initials(member.displayName) }}</span>
            </el-avatar>
          </el-tooltip>
          <el-avatar
            v-if="remainingMemberCount"
            :size="28"
            class="avatar-group__avatar avatar-group__more"
          >
            +{{ remainingMemberCount }}
          </el-avatar>
        </div>
        <div v-else class="project-card__empty-members">
          <el-icon><User /></el-icon>
          <span>No assigned users</span>
        </div>
        <el-tag v-if="project.reviewLocked" size="small" type="warning">In review</el-tag>
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.project-card {
  height: 100%;
  cursor: pointer;
  outline: none;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.project-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.project-card:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}

.project-card.is-archived {
  opacity: 0.78;
}

.project-card :deep(.el-card__body) {
  display: grid;
  gap: 10px;
  min-height: 118px;
}

.project-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.project-card__header > div {
  min-width: 0;
}

.project-card__header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.project-card__header h2 {
  overflow: hidden;
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 650;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card__slug {
  display: block;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card__description {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.project-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--text-muted);
  font-size: 11px;
}

.project-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
}

.avatar-group {
  display: flex;
  align-items: center;
  padding-left: 6px;
}

.avatar-group__avatar {
  margin-left: -6px;
  border: 2px solid var(--surface-card);
  font-size: 10px;
}

.avatar-group__more {
  color: var(--text-secondary);
  background: var(--surface-subtle);
}

.project-card__empty-members {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
