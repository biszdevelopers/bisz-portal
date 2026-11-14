<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    backTo?: string;
    backLabel?: string;
  }>(),
  { description: "", backTo: "", backLabel: "Back" },
);
</script>

<template>
  <header class="page-header">
    <div>
      <NuxtLink v-if="backTo" class="page-back" :to="backTo">
        {{ backLabel }}
      </NuxtLink>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-back {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 13px;
  text-decoration: none;
}

.page-back:hover {
  color: var(--accent);
}
</style>
