<script setup lang="ts">
import { CopyDocument } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { Component } from "vue";

const props = withDefaults(
  defineProps<{
    value: string;
    label?: string;
    successMessage?: string;
    icon?: Component;
  }>(),
  {
    successMessage: "Copied",
  },
);

async function copy() {
  await navigator.clipboard.writeText(props.value);
  ElMessage.success(props.successMessage);
}
</script>

<template>
  <el-tooltip :content="label ?? 'Copy'" :disabled="Boolean(label)">
    <el-button
      :icon="icon ?? CopyDocument"
      :circle="!label"
      :aria-label="label ?? 'Copy'"
      @click="copy"
      >{{ label }}</el-button
    >
  </el-tooltip>
</template>
