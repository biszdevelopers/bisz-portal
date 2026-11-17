<script setup lang="ts">
import { EditPen } from "@element-plus/icons-vue";
import type {
  IncidentDetail,
  IncidentStatus,
  IncidentView,
  UserSummary,
} from "~/shared/contracts";
import { formatDate, formatDateTime } from "~/utils/format";

const route = useRoute();
const incidentId = computed(() => String(route.params.incidentId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error, refresh } = await useFetch<{
  incident: IncidentDetail;
}>(() => `/api/incidents/${encodeURIComponent(incidentId.value)}`, { headers });
const incident = computed(() => data.value?.incident);
const projects = ref<Array<{ id: string; name: string }>>([]);
const editOpen = ref(false);
const saving = ref(false);
const assignee = ref<UserSummary[]>([]);
const requestError = shallowRef<unknown>(null);
const activityFeed = ref<{ refresh: () => void }>();

const severityType = computed(() =>
  incident.value?.severity === "critical"
    ? "danger"
    : incident.value?.severity === "high"
      ? "warning"
      : incident.value?.severity === "medium"
        ? "info"
        : "success",
);

watch(
  incident,
  (value) => {
    if (!value) return;
    assignee.value = value.assignee ? [value.assignee] : [];
  },
  { immediate: true },
);

async function patch(body: Record<string, unknown>) {
  if (!incident.value || saving.value) return;
  saving.value = true;
  try {
    const response = await $fetch<{ incident: IncidentView }>(
      `/api/incidents/${encodeURIComponent(incident.value.id)}`,
      { method: "PATCH", body },
    );
    if (data.value) data.value.incident = { ...data.value.incident, ...response.incident };
    requestError.value = null;
    activityFeed.value?.refresh();
    ElMessage.success("Incident updated");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(backendErrorMessage(caught, "The incident could not be updated."));
  } finally {
    saving.value = false;
  }
}

async function changeStatus(status: IncidentStatus) {
  await patch({ status });
}

async function changeAssignee(users: UserSummary[]) {
  assignee.value = users;
  await patch({ assigneeId: users[0]?.id ?? null });
}

async function loadProjects() {
  try {
    const response = await $fetch<{ projects: Array<{ id: string; name: string }> }>(
      "/api/projects",
    );
    projects.value = response.projects;
  } catch {
    projects.value = [];
  }
}

function onSaved(saved: IncidentView) {
  if (data.value) data.value.incident = { ...data.value.incident, ...saved };
}

onMounted(() => void loadProjects());

useHead(() => ({
  title: incident.value ? `${incident.value.title} · Incidents` : "Incident",
}));
</script>

<template>
  <section v-loading="pending" class="page incident-detail">
    <BackendErrorDetails v-if="error || requestError" :error="requestError || error" />

    <template v-if="incident">
      <PageHeader
        :title="incident.title"
        :back-to="`/projects/${encodeURIComponent(incident.projectId)}#incidents`"
        back-label="Project incidents"
      >
        <template #meta>
          <div class="incident-meta">
            <el-tag :type="severityType">{{ incident.severity }}</el-tag>
            <el-tag :type="incident.status === 'resolved' ? 'success' : incident.status === 'investigating' ? 'warning' : 'info'">
              {{ incident.status }}
            </el-tag>
            <span class="muted">{{ incident.projectName }}</span>
            <span class="muted">{{ incident.dueDate ? `Due ${formatDate(incident.dueDate)}` : "No due date" }}</span>
          </div>
        </template>
        <template #actions>
          <el-button v-if="incident.capabilities.update" :icon="EditPen" @click="editOpen = true">
            Edit incident
          </el-button>
        </template>
      </PageHeader>

      <div class="incident-layout">
        <div class="incident-main">
          <el-card shadow="never" class="incident-description">
            <MarkdownContent :source="incident.description" />
          </el-card>

          <CommentThread
            :project-id="incident.projectId"
            :incident-id="incident.id"
            :can-write="incident.capabilities.update"
            @changed="refresh(); activityFeed?.refresh()"
          />

          <el-card shadow="never">
            <template #header>Activity</template>
            <ActivityFeed ref="activityFeed" :project-id="incident.projectId" :incident-id="incident.id" />
          </el-card>
        </div>

        <aside class="incident-sidebar">
          <section v-if="incident.capabilities.update" class="surface incident-side-card">
            <h2>Status</h2>
            <el-select
              :model-value="incident.status"
              :loading="saving"
              @change="(value: IncidentStatus) => changeStatus(value)"
            >
              <el-option label="Open" value="open" />
              <el-option label="Investigating" value="investigating" />
              <el-option label="Resolved" value="resolved" />
            </el-select>
            <h2>Assignee</h2>
            <UsersInput
              :model-value="assignee"
              :project-id="incident.projectId"
              :maximum="1"
              placeholder="Assign a project member"
              @update:model-value="changeAssignee"
            />
          </section>

          <section class="surface incident-side-card">
            <h2>Details</h2>
            <dl>
              <div><dt>Project</dt><dd><NuxtLink :to="`/projects/${encodeURIComponent(incident.projectId)}`">{{ incident.projectName }}</NuxtLink></dd></div>
              <div><dt>Severity</dt><dd>{{ incident.severity }}</dd></div>
              <div><dt>Status</dt><dd>{{ incident.status }}</dd></div>
              <div><dt>Assignee</dt><dd>{{ incident.assignee?.displayName ?? "Unassigned" }}</dd></div>
              <div><dt>Due</dt><dd>{{ incident.dueDate ? formatDate(incident.dueDate) : "No due date" }}</dd></div>
              <div><dt>Created</dt><dd>{{ formatDateTime(incident.createdAt) }}</dd></div>
              <div v-if="incident.resolvedAt"><dt>Resolved</dt><dd>{{ formatDateTime(incident.resolvedAt) }}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </template>

    <IncidentDialog
      v-model="editOpen"
      :incident="incident"
      :projects="projects"
      @saved="onSaved"
    />
  </section>
</template>

<style scoped>
.incident-detail {
  display: grid;
  gap: 16px;
}

.incident-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
}

.incident-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: start;
  gap: 20px;
}

.incident-main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.incident-description {
  min-height: 140px;
}

.incident-sidebar {
  display: grid;
  gap: 12px;
  position: sticky;
  top: 0;
  max-height: calc(100dvh - 64px - 40px);
  overflow-y: auto;
}

.incident-side-card {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.incident-side-card h2 {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.incident-side-card dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.incident-side-card dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.incident-side-card dt {
  color: var(--text-muted);
  font-size: 12px;
}

.incident-side-card dd {
  margin: 0;
  font-size: 12px;
  text-align: right;
}

.incident-side-card dd a {
  color: var(--accent);
  text-decoration: none;
}

@media (max-width: 1023px) {
  .incident-layout {
    grid-template-columns: 1fr;
  }

  .incident-sidebar {
    position: static;
    max-height: none;
    overflow: visible;
    order: -1;
  }
}
</style>
