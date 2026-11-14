<script setup lang="ts">
import { Download, Plus, Search } from "@element-plus/icons-vue";
import type {
  IncidentPage,
  IncidentSeverity,
  IncidentStatus,
  IncidentView,
  ProjectSummary,
  UserSummary,
} from "~/shared/contracts";
import { formatDate } from "~/utils/format";

const route = useRoute();
const router = useRouter();
const { capabilities, pending: accessPending, error: accessError } =
  usePortalAccess();
const incidents = ref<IncidentView[]>([]);
const projects = ref<ProjectSummary[]>([]);
const loading = ref(false);
const loadError = shallowRef<unknown>(null);
const nextCursor = ref<string | null>(null);
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
const projectId = ref(
  typeof route.query.projectId === "string" ? route.query.projectId : "",
);
const status = ref(typeof route.query.status === "string" ? route.query.status : "");
const severity = ref(
  typeof route.query.severity === "string" ? route.query.severity : "",
);
const assignee = ref<UserSummary[]>([]);
const dialog = ref(route.query.new === "1");
const editing = ref<IncidentView | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const exportUrl = computed(() => {
  const params = new URLSearchParams();
  if (q.value.trim()) params.set("q", q.value.trim());
  if (projectId.value) params.set("projectId", projectId.value);
  if (status.value) params.set("status", status.value);
  if (severity.value) params.set("severity", severity.value);
  if (assignee.value[0]) params.set("assigneeId", assignee.value[0].id);
  return `/api/incidents/export.csv?${params.toString()}`;
});

const savedQuery = computed(() =>
  Object.fromEntries(
    Object.entries({
      q: q.value.trim(),
      projectId: projectId.value,
      status: status.value,
      severity: severity.value,
      assigneeId: assignee.value[0]?.id ?? "",
    }).filter(([, value]) => value),
  ),
);

const severityType = (value: IncidentSeverity) =>
  value === "critical" ? "danger" : value === "high" ? "warning" : value === "medium" ? "info" : "success";
const statusLabel = (value: IncidentStatus) =>
  value === "investigating" ? "Investigating" : value === "resolved" ? "Resolved" : "Open";

function syncUrl() {
  const query: Record<string, string> = {};
  if (q.value.trim()) query.q = q.value.trim();
  if (projectId.value) query.projectId = projectId.value;
  if (status.value) query.status = status.value;
  if (severity.value) query.severity = severity.value;
  if (assignee.value[0]) query.assigneeId = assignee.value[0].id;
  void router.replace({ query });
}

async function fetchIncidents(reset = true) {
  loading.value = true;
  loadError.value = null;
  try {
    const response = await $fetch<IncidentPage>("/api/incidents", {
      query: {
        limit: 40,
        ...(q.value.trim() ? { q: q.value.trim() } : {}),
        ...(projectId.value ? { projectId: projectId.value } : {}),
        ...(status.value ? { status: status.value } : {}),
        ...(severity.value ? { severity: severity.value } : {}),
        ...(assignee.value[0] ? { assigneeId: assignee.value[0].id } : {}),
        ...(!reset && nextCursor.value ? { cursor: nextCursor.value } : {}),
      },
    });
    incidents.value = reset
      ? response.incidents
      : [...incidents.value, ...response.incidents];
    nextCursor.value = response.nextCursor;
    syncUrl();
  } catch (caught) {
    loadError.value = caught;
  } finally {
    loading.value = false;
  }
}

async function loadProjects() {
  try {
    const response = await $fetch<{ projects: ProjectSummary[] }>("/api/projects");
    projects.value = response.projects;
  } catch {
    projects.value = [];
  }
}

async function applySaved(value: Record<string, unknown>) {
  q.value = String(value.q ?? "");
  projectId.value = String(value.projectId ?? "");
  status.value = String(value.status ?? "");
  severity.value = String(value.severity ?? "");
  const assigneeId = String(value.assigneeId ?? "");
  if (!assigneeId) {
    assignee.value = [];
    return;
  }
  try {
    const response = await $fetch<{
      user: { id: string; displayName: string | null; email: string; image: string | null };
    }>(`/api/users/${encodeURIComponent(assigneeId)}`);
    assignee.value = [
      {
        id: response.user.id,
        displayName: response.user.displayName || response.user.email,
        email: response.user.email,
        image: response.user.image,
      },
    ];
  } catch {
    assignee.value = [];
  }
}

function openCreate() {
  editing.value = null;
  dialog.value = true;
}

function openEdit(incident: IncidentView) {
  editing.value = incident;
  dialog.value = true;
}

function onSaved(incident: IncidentView) {
  const index = incidents.value.findIndex((item) => item.id === incident.id);
  if (index >= 0) incidents.value[index] = incident;
  else incidents.value = [incident, ...incidents.value];
}

watch(q, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void fetchIncidents(true), 300);
});
watch([projectId, status, severity, assignee], () => void fetchIncidents(true));
watch(dialog, (open) => {
  if (!open && typeof route.query.new === "string") {
    const query = { ...route.query } as Record<string, string | string[]>;
    delete query.new;
    void router.replace({ query });
  }
});

onMounted(async () => {
  await Promise.all([fetchIncidents(true), loadProjects()]);
});
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

useHead({ title: "Incidents · DevConnect" });
</script>

<template>
  <section class="page incidents-page">
    <PageHeader title="Incidents" description="Track, assign, and resolve workspace incidents.">
      <template #actions>
        <el-button tag="a" :href="exportUrl" :icon="Download">Export CSV</el-button>
        <el-button v-if="capabilities.incidentsCreate" type="primary" :icon="Plus" @click="openCreate">
          Report incident
        </el-button>
      </template>
    </PageHeader>

    <AccessDenied
      v-if="!accessPending && !capabilities.incidentsRead"
      description="You need BiszPortal.Incidents.read to open the incident workspace."
    />
    <BackendErrorDetails v-else-if="accessError || loadError" :error="accessError || loadError" />
    <template v-else>
      <div class="incident-toolbar surface">
        <el-input v-model="q" :prefix-icon="Search" clearable placeholder="Search incidents" aria-label="Search incidents" />
        <el-select v-model="projectId" clearable placeholder="All projects" aria-label="Filter by project">
          <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
        </el-select>
        <el-select v-model="status" clearable placeholder="Any status" aria-label="Filter by status">
          <el-option label="Open" value="open" />
          <el-option label="Investigating" value="investigating" />
          <el-option label="Resolved" value="resolved" />
        </el-select>
        <el-select v-model="severity" clearable placeholder="Any severity" aria-label="Filter by severity">
          <el-option label="Low" value="low" />
          <el-option label="Medium" value="medium" />
          <el-option label="High" value="high" />
          <el-option label="Critical" value="critical" />
        </el-select>
        <UsersInput v-model="assignee" :maximum="1" placeholder="Assignee" />
      </div>

      <SavedFilterBar scope="incidents" :current-query="savedQuery" @apply="applySaved" />

      <div v-if="incidents.length" class="incident-list">
        <article v-for="incident in incidents" :key="incident.id" class="incident-card surface">
          <div class="incident-card__main">
            <div class="incident-card__badges">
              <el-tag :type="severityType(incident.severity)" size="small">{{ incident.severity }}</el-tag>
              <el-tag :type="incident.status === 'resolved' ? 'success' : incident.status === 'investigating' ? 'warning' : 'info'" size="small">
                {{ statusLabel(incident.status) }}
              </el-tag>
              <span class="muted">{{ incident.projectName }}</span>
            </div>
            <NuxtLink :to="`/incidents/${encodeURIComponent(incident.id)}`" class="incident-card__title">
              {{ incident.title }}
            </NuxtLink>
            <p class="incident-card__description">{{ markdownExcerpt(incident.description, 200) }}</p>
            <div class="incident-card__meta">
              <span>{{ incident.assignee ? `Assigned to ${incident.assignee.displayName}` : "Unassigned" }}</span>
              <span>{{ incident.dueDate ? `Due ${formatDate(incident.dueDate)}` : "No due date" }}</span>
              <span>{{ timeAgo(incident.createdAt) }}</span>
            </div>
          </div>
          <div class="incident-card__actions">
            <el-button v-if="incident.capabilities.update" text :icon="Plus" @click="openEdit(incident)">Edit</el-button>
            <NuxtLink :to="`/incidents/${encodeURIComponent(incident.id)}`">
              <el-button text>Open</el-button>
            </NuxtLink>
          </div>
        </article>
        <el-button v-if="nextCursor" :loading="loading" class="load-more" @click="fetchIncidents(false)">
          Load more incidents
        </el-button>
      </div>
      <el-empty v-else-if="!loading" :image-size="84" description="No incidents match these filters." />
      <div v-else v-loading="loading" class="loading-surface" />
    </template>

    <IncidentDialog
      v-model="dialog"
      :incident="editing"
      :projects="projects"
      @saved="onSaved"
    />
  </section>
</template>

<style scoped>
.incidents-page {
  display: grid;
  gap: 14px;
}

.incident-toolbar {
  display: grid;
  grid-template-columns: minmax(200px, 1.5fr) repeat(4, minmax(130px, 1fr));
  gap: 8px;
  padding: 12px;
}

.incident-list {
  display: grid;
  gap: 8px;
}

.incident-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 14px 16px;
}

.incident-card__main {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.incident-card__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.incident-card__title {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 650;
  text-decoration: none;
}

.incident-card__title:hover {
  color: var(--accent);
}

.incident-card__description {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.incident-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  color: var(--text-muted);
  font-size: 11px;
}

.incident-card__actions {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.load-more {
  justify-self: center;
}

.loading-surface {
  min-height: 220px;
}

@media (max-width: 767px) {
  .incident-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .incident-toolbar > :first-child {
    grid-column: 1 / -1;
  }

  .incident-toolbar > :last-child {
    grid-column: 1 / -1;
  }

  .incident-card {
    grid-template-columns: 1fr;
  }

  .incident-card__actions {
    justify-content: flex-end;
  }
}
</style>
