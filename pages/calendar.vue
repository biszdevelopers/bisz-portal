<script setup lang="ts">
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import type { CalendarEvent, CalendarResponse } from "~/shared/contracts";
import { formatDate } from "~/utils/format";

const { capabilities, pending: accessPending, error: accessError } =
  usePortalAccess();
const { isMobile } = useViewport();
const projects = ref<Array<{ id: string; name: string }>>([]);
const projectId = ref("");
const showTasks = ref(true);
const showIncidents = ref(true);
const cursor = ref(startOfMonth(new Date()));
const events = ref<CalendarEvent[]>([]);
const loading = ref(false);
const loadError = shallowRef<unknown>(null);

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const gridStart = computed(() => {
  const first = new Date(cursor.value);
  first.setDate(first.getDate() - first.getDay());
  return first;
});
const gridDays = computed(() =>
  Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.value);
    date.setDate(date.getDate() + index);
    return date;
  }),
);
const range = computed(() => ({
  from: localDate(gridStart.value),
  to: localDate(gridDays.value[41] ?? gridStart.value),
}));
const monthLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(cursor.value),
);

const filteredEvents = computed(() =>
  events.value.filter(
    (event) =>
      (event.type === "task" ? showTasks.value : showIncidents.value) &&
      (!projectId.value || event.projectId === projectId.value),
  ),
);
const eventsByDate = computed(() => {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of filteredEvents.value) {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  return map;
});
const agenda = computed(() => {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of filteredEvents.value) {
    const list = groups.get(event.date) ?? [];
    list.push(event);
    groups.set(event.date, list);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, items]) => ({ date, items }));
});

function isToday(date: Date) {
  return localDate(date) === localDate(new Date());
}
function isCurrentMonth(date: Date) {
  return date.getMonth() === cursor.value.getMonth();
}

function move(delta: number) {
  const next = new Date(cursor.value);
  next.setMonth(next.getMonth() + delta);
  cursor.value = startOfMonth(next);
}

function goToday() {
  cursor.value = startOfMonth(new Date());
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const response = await $fetch<CalendarResponse>("/api/calendar", {
      query: {
        from: range.value.from,
        to: range.value.to,
        ...(projectId.value ? { projectId: projectId.value } : {}),
      },
    });
    events.value = response.events;
  } catch (caught) {
    loadError.value = caught;
  } finally {
    loading.value = false;
  }
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

watch([cursor, projectId], () => void load());

onMounted(async () => {
  await Promise.all([load(), loadProjects()]);
});

useHead({ title: "Calendar · DevConnect" });
</script>

<template>
  <section class="page calendar-page">
    <PageHeader title="Calendar" description="Tasks and incidents with due dates across your projects.">
      <template #actions>
        <el-select v-model="projectId" clearable placeholder="All projects" aria-label="Filter by project">
          <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
        </el-select>
        <el-checkbox v-model="showTasks">Tasks</el-checkbox>
        <el-checkbox v-model="showIncidents">Incidents</el-checkbox>
      </template>
    </PageHeader>

    <AccessDenied
      v-if="!accessPending && !capabilities.calendarRead"
      description="You need BiszPortal.Calendar.read to open the workspace calendar."
    />
    <BackendErrorDetails v-else-if="accessError || loadError" :error="accessError || loadError" />
    <template v-else>
      <div class="calendar-toolbar surface">
        <div class="calendar-toolbar__nav">
          <el-button text :icon="ArrowLeft" aria-label="Previous month" @click="move(-1)" />
          <strong>{{ monthLabel }}</strong>
          <el-button text :icon="ArrowRight" aria-label="Next month" @click="move(1)" />
        </div>
        <el-button @click="goToday">Today</el-button>
      </div>

      <div v-loading="loading" class="calendar-wrap">
        <div v-if="!isMobile" class="calendar-grid surface">
          <div v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="day" class="calendar-grid__weekday">
            {{ day }}
          </div>
          <div
            v-for="date in gridDays"
            :key="localDate(date)"
            class="calendar-day"
            :class="{ 'is-outside': !isCurrentMonth(date), 'is-today': isToday(date) }"
          >
            <span class="calendar-day__number">{{ date.getDate() }}</span>
            <div class="calendar-day__events">
              <NuxtLink
                v-for="event in (eventsByDate.get(localDate(date)) ?? []).slice(0, 3)"
                :key="`${event.type}:${event.id}`"
                :to="event.url"
                class="calendar-event"
                :class="`is-${event.type}`"
                :title="`${event.title} · ${event.projectName}`"
              >
                <span class="calendar-event__dot" />
                <span>{{ event.title }}</span>
              </NuxtLink>
              <span v-if="(eventsByDate.get(localDate(date)) ?? []).length > 3" class="calendar-day__more">
                +{{ (eventsByDate.get(localDate(date)) ?? []).length - 3 }} more
              </span>
            </div>
          </div>
        </div>

        <div v-else class="agenda">
          <section v-for="group in agenda" :key="group.date" class="agenda-group surface">
            <h2>{{ formatDate(group.date) }}</h2>
            <NuxtLink v-for="event in group.items" :key="`${event.type}:${event.id}`" :to="event.url" class="agenda-item">
              <span class="calendar-event__dot" :class="`is-${event.type}`" />
              <span>
                <strong>{{ event.title }}</strong>
                <small>{{ event.projectName }} · {{ event.type }}</small>
              </span>
              <el-tag size="small" :type="event.type === 'incident' ? 'warning' : 'info'">{{ event.status }}</el-tag>
            </NuxtLink>
          </section>
          <el-empty v-if="!agenda.length && !loading" :image-size="84" description="No dated work in this range." />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.calendar-page {
  display: grid;
  gap: 14px;
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
}

.calendar-toolbar__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.calendar-toolbar__nav strong {
  min-width: 170px;
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  overflow: hidden;
}

.calendar-grid__weekday {
  padding: 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 650;
  text-align: center;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.calendar-day {
  display: grid;
  align-content: start;
  gap: 4px;
  min-height: 116px;
  padding: 6px;
  border-right: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.calendar-day:nth-child(7n + 7) {
  border-right: 0;
}

.calendar-day.is-outside {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface-subtle) 55%, transparent);
}

.calendar-day.is-today .calendar-day__number {
  display: inline-grid;
  width: 22px;
  height: 22px;
  color: var(--accent-contrast);
  background: var(--accent);
  border-radius: 50%;
  place-items: center;
}

.calendar-day__number {
  font-size: 12px;
  font-weight: 600;
}

.calendar-day__events {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.calendar-event {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 2px 4px;
  color: var(--text-primary);
  font-size: 11px;
  text-decoration: none;
  border-radius: var(--radius-xs);
}

.calendar-event:hover {
  background: var(--surface-subtle);
}

.calendar-event span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-event__dot {
  flex: none;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
}

.calendar-event.is-incident .calendar-event__dot,
.calendar-event__dot.is-incident {
  background: var(--status-warning);
}

.calendar-day__more {
  color: var(--text-muted);
  font-size: 10px;
}

.agenda {
  display: grid;
  gap: 10px;
}

.agenda-group {
  display: grid;
  gap: 4px;
  padding: 12px;
}

.agenda-group h2 {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.agenda-item {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px;
  color: var(--text-primary);
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.agenda-item:hover {
  background: var(--surface-subtle);
}

.agenda-item span:nth-child(2) {
  display: grid;
  min-width: 0;
}

.agenda-item strong,
.agenda-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agenda-item strong {
  font-size: 13px;
}

.agenda-item small {
  color: var(--text-muted);
  font-size: 11px;
}

@media (max-width: 767px) {
  .calendar-toolbar {
    flex-wrap: wrap;
  }

  .calendar-toolbar__nav {
    flex: 1;
  }

  .calendar-toolbar__nav strong {
    min-width: 0;
    flex: 1;
  }
}
</style>
