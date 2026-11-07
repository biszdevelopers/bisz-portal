<script setup lang="ts">
import {
  Collection,
  Connection,
  DocumentChecked,
  FolderOpened,
  Lock,
  Right,
  User,
} from "@element-plus/icons-vue";
import { NuxtLink } from "#components";

const { capabilities, data, error, pending } = usePortalAccess();
const accessError = computed(() =>
  error.value?.statusCode === 401 ? undefined : error.value,
);
const needsSignIn = computed(
  () => !pending.value && !data.value && !accessError.value,
);
const accessLabel = computed(() => {
  if (pending.value) return "Checking access";
  if (accessError.value) return "Access unavailable";
  return needsSignIn.value ? "Sign-in required" : "Permission required";
});

enum TimeOfDay {
  Morning = "MORNING",
  Afternoon = "AFTERNOON",
  Evening = "EVENING",
}

function getCurrentTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hours = date.getHours();

  if (hours >= 5 && hours < 12) return TimeOfDay.Morning;
  if (hours >= 12 && hours < 17) return TimeOfDay.Afternoon;
  return TimeOfDay.Evening;
}

const greeting = computed(() => {
  const name = data.value?.user.name ?? "User";

  if (getCurrentTimeOfDay() === TimeOfDay.Morning) {
    return `Good morning! ${name}`;
  }
  if (getCurrentTimeOfDay() === TimeOfDay.Afternoon) {
    return `Good afternoon! ${name}`;
  }
  return `Good evening! ${name}`;
});

const tools = computed(() => [
  {
    title: "Projects",
    to: "/projects",
    icon: FolderOpened,
    description: "Browse projects, team members, and linked resources.",
    available: capabilities.value.projectsRead,
  },
  {
    title: "Tasks",
    to: "/tasks",
    icon: DocumentChecked,
    description: "Review assignments, due dates, and progress across projects.",
    available: capabilities.value.tasksRead,
  },
  {
    title: "Assets",
    to: "/assets",
    icon: Collection,
    description: "Browse public assets and manage shared files in DevConnect Assets.",
    available: true,
  },
]);

const adminLinks = computed(() =>
  [
    {
      label: "Users",
      to: "/users",
      icon: User,
      available: capabilities.value.usersRead,
    },
    {
      label: "Applications",
      to: "/applications",
      icon: Connection,
      available: capabilities.value.applicationsRead,
    },
  ].filter((link) => link.available),
);
</script>

<template>
  <section class="overview" aria-labelledby="overview-title">
    <header class="page-header">
      <h1 id="overview-title">{{ data?.user ? greeting : "Overview" }}</h1>
      <p>
        Manage projects, review assignments, and find shared assets across your
        teams.
      </p>
    </header>

    <BackendErrorDetails
      v-if="accessError"
      :error="accessError"
      fallback-description="Unable to load workspace access."
    />

    <section class="workspace-tools" aria-labelledby="workspace-tools-title">
      <h2 id="workspace-tools-title">Workspace tools</h2>
      <ul class="workspace-tools__grid">
        <li v-for="tool in tools" :key="tool.to">
          <component
            :is="tool.available ? NuxtLink : 'div'"
            :to="tool.available ? tool.to : undefined"
            class="workspace-tool"
          >
            <div class="workspace-tool__header">
              <el-icon class="workspace-tool__icon" aria-hidden="true">
                <component :is="tool.icon" />
              </el-icon>
              <el-icon v-if="tool.available" aria-hidden="true">
                <Right />
              </el-icon>
              <span v-else class="workspace-tool__access">
                <el-icon aria-hidden="true"><Lock /></el-icon>
                {{ accessLabel }}
              </span>
            </div>
            <h3>{{ tool.title }}</h3>
            <p>{{ tool.description }}</p>
          </component>
        </li>
      </ul>
    </section>

    <section
      v-if="adminLinks.length"
      class="workspace-admin"
      aria-labelledby="workspace-admin-title"
    >
      <h2 id="workspace-admin-title">Administration</h2>
      <NuxtLink v-for="link in adminLinks" :key="link.to" :to="link.to">
        <el-icon aria-hidden="true"><component :is="link.icon" /></el-icon>
        {{ link.label }}
      </NuxtLink>
    </section>
  </section>
</template>

<style scoped>
.overview {
  container-type: inline-size;
  display: grid;
  gap: 28px;
  max-width: 1440px;
  margin-inline: auto;
}

.overview > .page-header {
  margin-bottom: 0;
}

.workspace-tools h2,
.workspace-admin h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 650;
}

.workspace-tools__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.workspace-tool {
  display: block;
  height: 100%;
  padding: 18px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  text-decoration: none;
}

.workspace-tool__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--el-text-color-regular);
  font-size: 16px;
}

.workspace-tool__icon {
  width: 40px;
  height: 40px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
  font-size: 20px;
}

.workspace-tool__access {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}

.workspace-tool h3 {
  margin: 12px 0 4px;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 650;
}

.workspace-tool p {
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.55;
}

a.workspace-tool:hover {
  border-color: var(--el-color-primary);
}

.workspace-tool:focus-visible,
.workspace-admin a:focus-visible {
  outline: 2px solid var(--el-color-primary-dark-2);
  outline-offset: 3px;
}

.workspace-admin {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 18px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-light);
}

.workspace-admin h2 {
  font-size: 14px;
}

.workspace-admin a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  color: var(--el-text-color-regular);
  font-size: 14px;
  text-decoration: none;
}

.workspace-admin a:hover {
  color: var(--el-text-color-primary);
  text-decoration: underline;
}

@container (max-width: 620px) {
  .workspace-tools__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

</style>
