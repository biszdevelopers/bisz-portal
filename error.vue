<script setup lang="ts">
import { RefreshRight, Right, WarningFilled } from "@element-plus/icons-vue";

const props = defineProps<{ error: unknown }>();
const details = computed(() =>
  normalizeBackendError(props.error, "The portal could not load this page."),
);
const status = computed(() => Number(details.value.status));
const title = computed(() => {
  if (status.value === 401) return "Sign-in required";
  if (status.value === 403) return "Access denied";
  if (status.value === 404) return "Page not found";
  return "Something went wrong";
});
const description = computed(() => {
  if (status.value === 401)
    return "Your session expired or this page needs an active DevConnect session.";
  if (status.value === 403)
    return "Your account does not have permission to view this page or project.";
  if (status.value === 404)
    return "The page or resource may have been moved, archived, or removed.";
  return "The portal could not complete this request. Reload the page or return to the overview.";
});

function recover() {
  clearError({ redirect: "/" });
}

function reload() {
  window.location.reload();
}

function signIn() {
  return navigateTo("/api/auth/callback/basis-auth", { external: true });
}

useHead(() => ({ title: `${title.value} · DevConnect` }));
</script>

<template>
  <NuxtLayout>
    <section class="error-page">
      <el-card class="error-card surface" shadow="never">
        <el-icon :size="44" color="var(--status-warning)">
          <WarningFilled />
        </el-icon>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
        <div class="error-actions">
          <el-button type="primary" @click="recover">Back to overview</el-button>
          <el-button :icon="RefreshRight" @click="reload">Reload</el-button>
          <el-button v-if="status === 401" :icon="Right" @click="signIn">
            Sign in
          </el-button>
        </div>
        <el-collapse class="error-details">
          <el-collapse-item title="Technical details" name="details">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="error">
                {{ details.error }}
              </el-descriptions-item>
              <el-descriptions-item label="description">
                {{ details.error_description }}
              </el-descriptions-item>
              <el-descriptions-item label="status">
                {{ details.status }}
              </el-descriptions-item>
              <el-descriptions-item label="code">
                {{ details.code }}
              </el-descriptions-item>
            </el-descriptions>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.error-page {
  display: grid;
  min-height: 70vh;
  padding: 24px 16px;
  place-items: center;
}

.error-card {
  width: 100%;
  max-width: 480px;
  padding: 12px;
  text-align: center;
}

.error-card h1 {
  margin: 16px 0 8px;
  font-size: 22px;
}

.error-card p {
  margin: 0 auto 20px;
  max-width: 380px;
  color: var(--text-muted);
  line-height: 1.55;
}

.error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.error-details {
  margin-top: 20px;
  text-align: left;
}

.error-details :deep(.el-descriptions) {
  margin-top: 4px;
}
</style>
