<script setup lang="ts">
import {
  Bell,
  Calendar,
  Check,
  DocumentChecked,
  FolderOpened,
  Grid,
  Monitor,
  Moon,
  Right,
  Sunny,
  SwitchButton,
  WarningFilled,
} from "@element-plus/icons-vue"
import type { ThemePreference } from "~/composables/useTheme"

const route = useRoute()
const { clear: clearUserSession, loggedIn, user } = useUserSession()
const { capabilities } = usePortalAccess()
const { preference, resolvedTheme, setTheme } = useTheme()

const systemThemeOption = { value: "system", label: "System", icon: Monitor } as const
const themeOptions = [
  systemThemeOption,
  { value: "light", label: "Light", icon: Sunny },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{ value: ThemePreference, label: string, icon: typeof Monitor }>

const activeTheme = computed(() => themeOptions.find((option) => option.value === preference.value) ?? systemThemeOption)
const activeThemeIcon = computed(() => preference.value === "system"
  ? (resolvedTheme.value === "dark" ? Moon : Sunny)
  : activeTheme.value.icon)

function handleThemeCommand(command: ThemePreference) {
  setTheme(command)
}

const navigation = computed(() => [
  { label: "Overview", path: "/", icon: Grid },
  { label: "Projects", path: "/projects", icon: FolderOpened, enabled: capabilities.value.projectsRead, permission: "BiszPortal.Projects.read" },
  { label: "Tasks", path: "/tasks", icon: DocumentChecked, enabled: capabilities.value.tasksRead, permission: "BiszPortal.Tasks.read" },
  { label: "Incidents", path: "/incidents", icon: WarningFilled, enabled: capabilities.value.incidentsRead, permission: "BiszPortal.Incidents.read" },
  { label: "Calendar", path: "/calendar", icon: Calendar, enabled: capabilities.value.calendarRead, permission: "BiszPortal.Calendar.read" },
])

const pageTitle = computed(
  () => navigation.value.find((item) => item.path === route.path)?.label ?? "Portal",
)

function navigate(item: (typeof navigation.value)[number]) {
  if (item.enabled === false) return
  navigateTo(item.path)
}

const accountName = computed(() => user.value?.name || (loggedIn.value ? "Basis user" : "Not signed in"))
const accountImage = computed(() => user.value?.image?.trim() || undefined)
const avatarFailed = ref(false)
const loggingOut = ref(false)

watch(accountImage, () => {
  avatarFailed.value = false
})

const accountInitials = computed(() => {
  const source = user.value?.name || (loggedIn.value ? "Basis user" : "Guest")
  const words = source.trim().split(/\s+/).filter(Boolean)

  return (words.length > 1 ? `${words[0]?.[0]}${words.at(-1)?.[0]}` : source.slice(0, 2)).toUpperCase()
})

async function signInWithDevConnect() {
  await navigateTo("/api/auth/callback/basis-auth", { external: true })
}

async function logout() {
  if (loggingOut.value) return

  loggingOut.value = true
  try {
    await clearUserSession()
    await navigateTo("/")
    await refreshNuxtData()
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <el-container class="portal-shell">
    <el-aside class="portal-aside" width="220px">
      <NuxtLink class="portal-brand" to="/" aria-label="Basis Portal">
        <span class="portal-brand__mark">B</span>
        <span>Basis Portal</span>
      </NuxtLink>

      <el-menu class="portal-menu" :default-active="route.path">
        <el-tooltip v-for="item in navigation" :key="item.path" :disabled="item.enabled !== false" :content="`Requires ${item.permission}`" placement="right">
          <div>
            <el-menu-item :index="item.path" :disabled="item.enabled === false" @click="navigate(item)">
              <el-icon><component :is="item.icon" /></el-icon>
              <span class="menu-label">{{ item.label }}</span>
            </el-menu-item>
          </div>
        </el-tooltip>
      </el-menu>

      <div class="portal-account">
        <template v-if="loggedIn">
          <el-avatar
            :size="34"
            :src="avatarFailed ? undefined : accountImage"
            fit="cover"
            @error="avatarFailed = true"
          >
            {{ accountInitials }}
          </el-avatar>
          <div class="portal-account__identity">
            <strong>{{ accountName }}</strong>
          </div>
          <el-tooltip content="Log out" placement="top">
            <el-button
              class="account-logout"
              text
              circle
              :icon="SwitchButton"
              :loading="loggingOut"
              aria-label="Log out"
              @click="logout"
            />
          </el-tooltip>
        </template>
        <el-button
          v-else
          class="account-login"
          type="primary"
          size="small"
          plain
          :icon="Right"
          aria-label="Sign in with DevConnect"
          @click="signInWithDevConnect"
        >
          <span class="account-login__label">Sign in</span>
        </el-button>
      </div>
    </el-aside>

    <el-container direction="vertical">
      <el-header class="portal-header">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>Workspace</el-breadcrumb-item>
          <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
        </el-breadcrumb>
        <div class="portal-actions">
          <el-dropdown trigger="click" @command="handleThemeCommand">
            <el-button class="theme-switcher" text :aria-label="`Theme: ${activeTheme.label}`">
              <el-icon><component :is="activeThemeIcon" /></el-icon>
              <span class="theme-switcher__label">{{ activeTheme.label }}</span>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="option in themeOptions"
                  :key="option.value"
                  :command="option.value"
                >
                  <el-icon><component :is="option.icon" /></el-icon>
                  <span>{{ option.label }}</span>
                  <el-icon v-if="preference === option.value" class="theme-option__check"><Check /></el-icon>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-badge is-dot class="notification-badge">
            <el-button :icon="Bell" text circle aria-label="Notifications" />
          </el-badge>
        </div>
      </el-header>

      <el-main class="portal-main">
        <slot />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.portal-shell {
  min-height: 100vh;
  background: var(--el-bg-color-page);
}

.portal-shell > .el-container {
  min-width: 0;
}

.portal-aside {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
}

.portal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 20px;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid var(--el-border-color-light);
}

.portal-brand__mark {
  display: grid;
  width: 30px;
  height: 30px;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border-radius: 4px;
  place-items: center;
}

.portal-menu {
  flex: 1;
  padding-top: 12px;
  border-right: 0;
}

.portal-menu :deep(.el-menu-item) {
  position: relative;
  gap: 10px;
  margin: 2px 10px;
  padding: 0 12px !important;
  border-radius: 4px;
}

.portal-menu :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary-light-9);
}

.portal-account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--el-border-color-light);
}

.portal-account :deep(.el-avatar) {
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
  background: var(--el-color-primary-light-9);
}

.portal-account__identity {
  min-width: 0;
  flex: 1;
}

.portal-account strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-login {
  flex: none;
  padding: 5px 8px;
}

.account-logout {
  flex: none;
}

.portal-account strong {
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 500;
}

.portal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.portal-actions,
.theme-switcher {
  display: flex;
  align-items: center;
}

.portal-actions {
  gap: 8px;
}

.theme-switcher {
  gap: 6px;
}

.theme-option__check {
  margin-left: auto;
  color: var(--el-color-primary);
}

.notification-badge :deep(.el-badge__content.is-fixed) {
  top: 7px;
  right: 7px;
}

.portal-main {
  min-width: 0;
  padding: 28px 32px;
  overflow-x: hidden;
}

@media (max-width: 760px) {
  .portal-aside {
    width: 64px !important;
  }

  .portal-brand {
    justify-content: center;
    padding: 0;
  }

  .portal-brand > span:last-child,
  .portal-menu :deep(.menu-label),
  .portal-account__identity {
    display: none;
  }

  .portal-menu :deep(.el-menu-item) {
    justify-content: center;
    padding: 0 !important;
  }

  .portal-account {
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 14px 0;
  }

  .account-login {
    width: 30px;
    padding: 5px;
  }

  .account-login__label {
    display: none;
  }

  .portal-main {
    padding: 20px 16px;
  }

  .theme-switcher__label {
    display: none;
  }
}
</style>
