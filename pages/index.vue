<script setup lang="ts">
import {
  Calendar,
  CircleCheck,
  DocumentChecked,
  FolderAdd,
  FolderOpened,
  Right,
  SetUp,
  WarningFilled,
} from "@element-plus/icons-vue";
import type { OverviewResponse } from "~/shared/contracts";
import { formatDate } from "~/utils/format";

const { capabilities, data: access, pending: accessPending, error: accessError } =
  usePortalAccess();
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error } = await useFetch<OverviewResponse>(
  "/api/overview",
  { headers },
);

const accessFailed = computed(
  () =>
    Boolean(accessError.value) &&
    normalizeBackendError(accessError.value).status !== 401,
);
const needsSignIn = computed(
  () => !accessPending.value && !access.value && !accessFailed.value,
);
const greeting = computed(() => access.value?.user.name ? `Welcome back, ${access.value.user.name}` : "Overview");
const today = computed(() =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date()),
);

const kpis = computed(() => [
  {
    label: "Open tasks",
    value: data.value?.kpis.openTasks ?? 0,
    icon: DocumentChecked,
    to: "/tasks",
    tone: "blue",
  },
  {
    label: "Due this week",
    value: data.value?.kpis.dueThisWeek ?? 0,
    icon: Calendar,
    to: "/calendar",
    tone: "amber",
  },
  {
    label: "Awaiting review",
    value: data.value?.kpis.awaitingReview ?? 0,
    icon: CircleCheck,
    to: "/tasks?status=in_review",
    tone: "green",
  },
  {
    label: "Open incidents",
    value: data.value?.kpis.openIncidents ?? 0,
    icon: WarningFilled,
    to: "/incidents",
    tone: "red",
  },
]);

function signIn() {
  return navigateTo("/api/auth/callback/basis-auth", { external: true });
}

useHead({ title: "Overview · DevConnect" });
</script>

<template>
  <section class="page overview">
    <PageHeader
      :title="greeting"
      :description="`${today} · Your projects, tasks, and incidents in one place.`"
    >
      <template #actions>
        <el-tooltip
          :disabled="capabilities.projectsCreate"
          content="Requires BiszPortal.Projects.create"
        >
          <span>
            <el-button
              v-if="capabilities.projectsCreate"
              type="primary"
              :icon="FolderAdd"
              @click="navigateTo('/projects/new')"
              >New project</el-button
            >
          </span>
        </el-tooltip>
        <el-button :icon="DocumentChecked" @click="navigateTo('/tasks')">My tasks</el-button>
      </template>
    </PageHeader>

    <BackendErrorDetails
      v-if="accessFailed"
      :error="accessError"
      fallback-description="Unable to load workspace access."
    />

    <div v-if="needsSignIn" class="overview__signin surface">
      <div class="overview__signin-mark" aria-hidden="true">D</div>
      <h2>Sign in to DevConnect</h2>
      <p>
        Projects, tasks, incidents, the calendar, and shared assets live behind
        your Basis account.
      </p>
      <el-button type="primary" :icon="Right" @click="signIn">
        Sign in with DevConnect
      </el-button>
    </div>

    <template v-else>
      <BackendErrorDetails v-if="error" :error="error" />

      <div class="kpi-grid" :class="{ 'is-loading': pending }">
        <NuxtLink
          v-for="kpi in kpis"
          :key="kpi.label"
          :to="kpi.to"
          class="kpi-card surface"
          :class="`is-${kpi.tone}`"
        >
          <span class="kpi-card__icon">
            <el-icon><component :is="kpi.icon" /></el-icon>
          </span>
          <span class="kpi-card__value">{{ kpi.value }}</span>
          <span class="kpi-card__label">{{ kpi.label }}</span>
        </NuxtLink>
      </div>

      <div class="overview-grid">
        <section class="overview-panel surface">
          <header class="overview-panel__header">
            <h2>My work</h2>
            <NuxtLink to="/tasks">View all <el-icon><Right /></el-icon></NuxtLink>
          </header>
          <div v-if="data?.myTasks.length" class="overview-list">
            <TaskCard v-for="task in data.myTasks" :key="task.id" :task="task" />
          </div>
          <p v-else class="overview-empty">
            Nothing assigned to you right now. Enjoy the quiet.
          </p>
        </section>

        <section class="overview-panel surface">
          <header class="overview-panel__header">
            <h2>Upcoming</h2>
            <NuxtLink to="/calendar">Calendar <el-icon><Right /></el-icon></NuxtLink>
          </header>
          <ul v-if="data?.upcoming.length" class="upcoming-list">
            <li v-for="event in data.upcoming" :key="`${event.type}:${event.id}`">
              <NuxtLink :to="event.url">
                <span class="upcoming-date">{{ formatDate(event.date) }}</span>
                <span class="upcoming-main">
                  <strong>{{ event.title }}</strong>
                  <small>{{ event.projectName }} · {{ event.type }}</small>
                </span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="overview-empty">Nothing due in the next week.</p>
        </section>

        <section class="overview-panel surface overview-panel--wide">
          <header class="overview-panel__header">
            <h2>Recent activity</h2>
            <span class="muted">{{ data?.unread ?? 0 }} unread notifications</span>
          </header>
          <ActivityFeed global :limit="8" compact />
        </section>

        <section class="overview-panel surface">
          <header class="overview-panel__header">
            <h2>Quick actions</h2>
          </header>
          <div class="quick-actions">
            <el-button v-if="capabilities.projectsRead" :icon="FolderOpened" @click="navigateTo('/projects')">
              Browse projects
            </el-button>
            <el-button v-if="capabilities.tasksRead" :icon="DocumentChecked" @click="navigateTo('/tasks')">
              Review tasks
            </el-button>
            <el-button v-if="capabilities.incidentsRead" :icon="WarningFilled" @click="navigateTo('/incidents?new=1')">
              Report incident
            </el-button>
            <el-button :icon="Calendar" @click="navigateTo('/calendar')">
              Open calendar
            </el-button>
          </div>
        </section>

        <section
          v-if="capabilities.applicationsRead || capabilities.usersRead || capabilities.resourcesRead"
          class="overview-panel surface"
        >
          <header class="overview-panel__header">
            <h2>Administration</h2>
          </header>
          <div class="quick-actions">
            <el-button v-if="capabilities.usersRead" @click="navigateTo('/users')">Users</el-button>
            <el-button v-if="capabilities.applicationsRead" @click="navigateTo('/applications')">
              Applications
            </el-button>
            <el-button v-if="capabilities.resourcesRead" :icon="SetUp" @click="navigateTo('/resources')">
              Resource Servers
            </el-button>
            <el-button v-if="capabilities.tagsRead" @click="navigateTo('/tags')">Tags</el-button>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.overview {
  display: grid;
  gap: 20px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.kpi-card {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 4px 12px;
  padding: 16px;
  color: var(--text-primary);
  text-decoration: none;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.kpi-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.kpi-card__icon {
  display: grid;
  grid-row: span 2;
  width: 40px;
  height: 40px;
  color: var(--accent);
  background: var(--el-color-primary-light-9);
  border-radius: var(--radius-md);
  font-size: 19px;
  place-items: center;
}

.kpi-card.is-amber .kpi-card__icon {
  color: var(--status-warning);
  background: var(--el-color-warning-light-9);
}

.kpi-card.is-green .kpi-card__icon {
  color: var(--status-success);
  background: var(--el-color-success-light-9);
}

.kpi-card.is-red .kpi-card__icon {
  color: var(--status-danger);
  background: var(--el-color-danger-light-9);
}

.kpi-card__value {
  font-size: 25px;
  font-weight: 700;
  line-height: 1.1;
}

.kpi-card__label {
  color: var(--text-muted);
  font-size: 12px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.overview-panel {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 16px;
}

.overview-panel--wide {
  grid-column: 1 / -1;
}

.overview-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.overview-panel__header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.overview-panel__header a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 12px;
  text-decoration: none;
}

.overview-panel__header a:hover {
  color: var(--accent);
}

.overview-list {
  display: grid;
  gap: 6px;
}

.overview-empty {
  margin: 8px 0;
  color: var(--text-muted);
  font-size: 13px;
}

.upcoming-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.upcoming-list a {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  color: var(--text-primary);
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.upcoming-list a:hover {
  background: var(--surface-subtle);
}

.upcoming-date {
  color: var(--text-muted);
  font-size: 12px;
}

.upcoming-main {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.upcoming-main strong,
.upcoming-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upcoming-main strong {
  font-size: 13px;
}

.upcoming-main small {
  color: var(--text-muted);
  font-size: 11px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.overview__signin {
  display: grid;
  justify-items: start;
  gap: 10px;
  max-width: 520px;
  padding: 28px;
}

.overview__signin h2 {
  margin: 0;
  font-size: 20px;
}

.overview__signin p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.55;
}

.overview__signin-mark {
  display: grid;
  width: 46px;
  height: 46px;
  color: var(--accent-contrast);
  background: var(--accent);
  border-radius: 12px;
  font-size: 22px;
  font-weight: 700;
  place-items: center;
}

@media (max-width: 1023px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .kpi-card {
    padding: 12px;
  }

  .kpi-card__value {
    font-size: 21px;
  }

  .upcoming-list a {
    grid-template-columns: 82px minmax(0, 1fr);
  }
}
</style>
