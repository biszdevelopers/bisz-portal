<script setup lang="ts">
import { MoreFilled } from "@element-plus/icons-vue";

defineProps<{
  items: Array<{ label: string; path: string; icon: unknown }>;
  activePath: string;
}>();
defineEmits<{ more: [] }>();
</script>

<template>
  <nav class="bottom-nav" aria-label="Primary">
    <NuxtLink
      v-for="item in items"
      :key="item.path"
      :to="item.path"
      class="bottom-nav__item"
      :class="{ 'is-active': activePath === item.path }"
      :aria-current="activePath === item.path ? 'page' : undefined"
    >
      <el-icon><component :is="item.icon" /></el-icon>
      <span>{{ item.label }}</span>
    </NuxtLink>
    <button type="button" class="bottom-nav__item" @click="$emit('more')">
      <el-icon><MoreFilled /></el-icon>
      <span>More</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: none;
  grid-template-columns: repeat(5, 1fr);
  padding-bottom: env(safe-area-inset-bottom);
  background: color-mix(in srgb, var(--surface-card) 92%, transparent);
  border-top: 1px solid var(--border-subtle);
  backdrop-filter: blur(12px);
}

.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 58px;
  padding: 6px 2px;
  color: var(--text-muted);
  font: inherit;
  font-size: 10px;
  text-decoration: none;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.bottom-nav__item .el-icon {
  font-size: 19px;
}

.bottom-nav__item.is-active {
  color: var(--accent);
}

.bottom-nav__item:focus-visible {
  outline-offset: -2px;
}

@media (max-width: 767px) {
  .bottom-nav {
    display: grid;
  }
}
</style>
