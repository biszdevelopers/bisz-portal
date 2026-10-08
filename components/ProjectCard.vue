<script setup lang="ts">
import { User } from "@element-plus/icons-vue"
import type { ProjectSummary } from "~/shared/contracts"

const props = defineProps<{ project: ProjectSummary }>()
const emit = defineEmits<{ select: [project: ProjectSummary] }>()

const visibleMembers = computed(() => props.project.members.slice(0, 5))
const remainingMemberCount = computed(() => Math.max(props.project.members.length - visibleMembers.value.length, 0))
const description = computed(() => {
  const plainText = props.project.description
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!plainText) return "No project description yet."
  return plainText.length > 180 ? `${plainText.slice(0, 177).trimEnd()}…` : plainText
})

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"
}
</script>

<template>
  <el-card
    class="project-card"
    shadow="hover"
    role="button"
    tabindex="0"
    @click="emit('select', project)"
    @keydown.enter="emit('select', project)"
    @keydown.space.prevent="emit('select', project)"
  >
    <template #header>
      <div class="project-card__header">
        <h2>{{ project.name }}</h2>
        <pre>{{ project.id }}</pre>
      </div>
    </template>

    <p class="project-card__description">{{ description }}</p>

    <template #footer>
      <div class="project-card__footer">
        <div v-if="project.members.length" class="avatar-group" :aria-label="`${project.members.length} assigned users`">
          <el-tooltip v-for="member in visibleMembers" :key="member.userId" :content="member.displayName" placement="top">
            <el-avatar :size="32" :src="member.image || undefined" class="avatar-group__avatar">
              <span v-if="!member.image">{{ initials(member.displayName) }}</span>
            </el-avatar>
          </el-tooltip>
          <el-avatar v-if="remainingMemberCount" :size="32" class="avatar-group__avatar avatar-group__more">
            +{{ remainingMemberCount }}
          </el-avatar>
        </div>
        <div v-else class="project-card__empty-members">
          <el-icon><User /></el-icon>
          <span>No assigned users</span>
        </div>
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.project-card { height: 100%; cursor: pointer; outline: none; transition: border-color .2s ease, transform .2s ease; }
.project-card:hover { border-color: var(--el-color-primary-light-5); transform: translateY(-2px); }
.project-card:focus-visible { box-shadow: 0 0 0 2px var(--el-color-primary-light-5); }
.project-card :deep(.el-card__body) { min-height: 112px; }
.project-card__header { min-width: 0; }
.project-card__header h2 { overflow: hidden; margin: 0 0 6px; font-size: 16px; font-weight: 400; line-height: 24px; text-overflow: ellipsis; white-space: nowrap; }
.project-card__header pre { overflow: hidden; margin: 0; color: var(--el-text-color-secondary); font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, Consolas, monospace); font-size: 11px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.project-card__description { display: -webkit-box; overflow: hidden; margin: 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 21px; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
.project-card__footer { display: flex; align-items: center; min-height: 32px; }
.avatar-group { display: flex; align-items: center; padding-left: 8px; }
.avatar-group__avatar { margin-left: -8px; border: 2px solid var(--el-bg-color); font-size: 11px; }
.avatar-group__more { color: var(--el-text-color-regular); background: var(--el-fill-color-dark); }
.project-card__empty-members { display: flex; align-items: center; gap: 6px; color: var(--el-text-color-placeholder); font-size: 12px; }
</style>
