<script setup lang="ts">
import type { UserDetail } from "~/shared/contracts";

const route = useRoute();
const userId = computed(() => String(route.params.userId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<{ user: UserDetail }>(
  () => `/api/users/${encodeURIComponent(userId.value)}`,
  { headers },
);
const user = computed(() => data.value?.user);

const initials = computed(() => {
  const source = user.value?.displayName?.trim() || user.value?.email || "User";
  const words = source.split(/\s+/).filter(Boolean);
  return (
    words.length > 1
      ? `${words[0]?.[0]}${words.at(-1)?.[0]}`
      : source.slice(0, 2)
  ).toUpperCase();
});

function valueOrDash(value: string | null) {
  return value?.trim() || "—";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}
</script>

<template>
  <section v-loading="pending">
    <header class="page-header user-header">
      <div>
        <el-link :underline="false" href="/users">Users</el-link>
        <h1>{{ user?.displayName?.trim() || "Basis user" }}</h1>
        <pre v-if="user" class="user-id">{{ user.id }}</pre>
      </div>
    </header>

    <BackendErrorDetails v-if="error" :error="error" />
    <el-card v-if="user" shadow="never" class="details-card">
      <el-descriptions title="General information" :column="2" border>
        <el-descriptions-item label="Profile picture" :span="2">
          <div class="identity">
            <el-avatar :size="48" :src="user.image || undefined">
              {{ initials }}
            </el-avatar>
            <span>{{ user.displayName?.trim() || "Basis user" }}</span>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="Name">
          {{ user.displayName?.trim() || "Basis user" }}
        </el-descriptions-item>
        <el-descriptions-item label="User ID">
          <pre>{{ user.id }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Email">
          {{ user.email }}
        </el-descriptions-item>
        <el-descriptions-item label="Status">
          <el-tag :type="user.disabled ? 'danger' : 'success'">
            {{ user.disabled ? "Disabled" : "Active" }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Identity provider">
          {{ user.provider }}
        </el-descriptions-item>
        <el-descriptions-item label="Upstream issuer">
          <span class="breakable">{{ user.upstreamIssuer }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="Upstream subject">
          <pre>{{ user.upstreamSubject }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Email domain ID">
          <pre>{{ valueOrDash(user.emailSuffixId) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="Student ID">
          {{ valueOrDash(user.studentId) }}
        </el-descriptions-item>
        <el-descriptions-item label="School district">
          {{ valueOrDash(user.schoolDistrict) }}
        </el-descriptions-item>
        <el-descriptions-item label="Created">
          {{ formatDate(user.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="Last updated">
          {{ formatDate(user.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="Tokens valid after" :span="2">
          {{ formatDate(user.tokensValidAfter) }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </section>
</template>

<style scoped>
.user-header h1 {
  margin-top: 8px;
}

.user-id,
pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: 12px/1.5 var(--el-font-family);
}

.details-card {
  margin-bottom: 18px;
}

.identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.breakable {
  overflow-wrap: anywhere;
}

@media (max-width: 700px) {
  .details-card :deep(.el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
