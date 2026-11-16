<script setup lang="ts">
import {
  Calendar,
  Check,
  Collection,
  Connection,
  DocumentChecked,
  FolderOpened,
  Grid,
  Monitor,
  Moon,
  PriceTag,
  Right,
  Search,
  SetUp,
  Setting,
  Sunny,
  SwitchButton,
  User as UserIcon,
  WarningFilled,
  Download,
} from "@element-plus/icons-vue";
import type { ThemePreference } from "~/composables/useTheme";
import { useCommandPalette } from "~/composables/useCommandPalette";
import { useKeyboardShortcuts } from "~/composables/useKeyboardShortcuts";
import { usePwa } from "~/composables/usePwa";
import { initials } from "~/utils/format";

const route = useRoute();
const { clear: clearUserSession, loggedIn, user } = useUserSession();
const { capabilities } = usePortalAccess();
const { preference, resolvedTheme, setTheme } = useTheme();
const { open: openPalette } = useCommandPalette();
const { helpVisible } = useKeyboardShortcuts();
const {
  installAvailable,
  install,
  disablePush,
  supported: pushSupported,
  updateReady,
  applyUpdate,
} = usePwa();

const moreOpen = ref(false);
const loggingOut = ref(false);

const systemThemeOption = {
  value: "system",
  label: "System",
  icon: Monitor,
} as const;
const themeOptions = [
  systemThemeOption,
  { value: "light", label: "Light", icon: Sunny },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}>;

const activeTheme = computed(
  () =>
    themeOptions.find((option) => option.value === preference.value) ??
    systemThemeOption,
);
const activeThemeIcon = computed(() =>
  preference.value === "system"
    ? resolvedTheme.value === "dark"
      ? Moon
      : Sunny
    : activeTheme.value.icon,
);

const navigation = computed(() => [
  { label: "Overview", path: "/", icon: Grid },
  {
    label: "Tasks",
    path: "/tasks",
    icon: DocumentChecked,
    enabled: capabilities.value.tasksRead,
    permission: "BiszPortal.Tasks.read",
  },
  {
    label: "Incidents",
    path: "/incidents",
    icon: WarningFilled,
    enabled: capabilities.value.incidentsRead,
    permission: "BiszPortal.Incidents.read",
  },
  {
    label: "Projects",
    path: "/projects",
    icon: FolderOpened,
    enabled: capabilities.value.projectsRead,
    permission: "BiszPortal.Projects.read",
  },
  {
    label: "Calendar",
    path: "/calendar",
    icon: Calendar,
    enabled: capabilities.value.calendarRead,
    permission: "BiszPortal.Calendar.read",
  },
  {
    label: "Users",
    path: "/users",
    icon: UserIcon,
    enabled: capabilities.value.usersRead,
    permission: "BiszPortal.Users.read",
  },
  {
    label: "Applications",
    path: "/applications",
    icon: Connection,
    enabled: capabilities.value.applicationsRead,
    permission: "BiszPortal.Applications.read.me or BiszPortal.Applications.read.others",
  },
  {
    label: "Resource Servers",
    path: "/resources",
    icon: SetUp,
    enabled: capabilities.value.resourcesRead,
    permission: "BiszPortal.Resources.read.me or BiszPortal.Resources.read.others",
  },
  {
    label: "Assets",
    path: "/assets",
    icon: Collection,
  },
  {
    label: "Tags",
    path: "/tags",
    icon: PriceTag,
    enabled: capabilities.value.tagsRead,
    permission: "BiszPortal.Tags.read",
  },
  { label: "Settings", path: "/settings", icon: Setting },
]);

const primaryNavigation = computed(() =>
  ["/", "/tasks", "/incidents", "/projects"].flatMap((path) => {
    const item = navigation.value.find((entry) => entry.path === path);
    return item && item.enabled !== false ? [item] : [];
  }),
);
const bottomColumns = computed(() => primaryNavigation.value.length + 1);

const activeNavigationPath = computed(() => {
  if (route.path === "/") return "/";
  const section = `/${route.path.split("/")[1] ?? ""}`;
  return navigation.value.some((item) => item.path === section)
    ? section
    : route.path;
});

const pageTitle = computed(
  () =>
    navigation.value.find(
      (item) =>
        activeNavigationPath.value === item.path || activeNavigationPath.value.startsWith(`${item.path}/`),
    )?.label ?? "Portal",
);

const accountName = computed(
  () => user.value?.name || (loggedIn.value ? "Basis user" : "Not signed in"),
);
const accountImage = computed(() => user.value?.image?.trim() || undefined);
const avatarFailed = ref(false);
watch(accountImage, () => {
  avatarFailed.value = false;
});
const accountInitials = computed(() => initials(accountName.value));

async function signInWithDevConnect() {
  await navigateTo("/api/auth/callback/basis-auth", { external: true });
}

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    clearAllAssetsBrowserTokens();
    if (pushSupported.value) await disablePush().catch(() => undefined);
    await $fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await clearUserSession().catch(() => undefined);
    clearNuxtData();
    await navigateTo("/");
  } finally {
    loggingOut.value = false;
    moreOpen.value = false;
  }
}

async function handleInstall() {
  await install();
}
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <el-container class="portal-shell">
    <el-aside class="portal-aside" width="240px">
      <NuxtLink class="portal-brand" to="/" aria-label="DevConnect overview">
        <span class="portal-brand__mark" aria-hidden="true">D</span>
        <span>DevConnect</span>
      </NuxtLink>

      <el-menu class="portal-menu" :default-active="activeNavigationPath">
        <el-tooltip
          v-for="item in navigation"
          :key="item.path"
          :disabled="item.enabled !== false"
          :content="`Requires ${item.permission}`"
          placement="right"
        >
          <div>
            <el-menu-item
              :index="item.path"
              :disabled="item.enabled === false"
              @click="item.enabled === false ? undefined : navigateTo(item.path)"
            >
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

    <el-container class="portal-body" direction="vertical">
      <el-header class="portal-header">
        <div class="portal-header__title">
          <el-breadcrumb separator="/" class="desktop-only">
            <el-breadcrumb-item>Workspace</el-breadcrumb-item>
            <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
          <strong class="mobile-only">{{ pageTitle }}</strong>
        </div>
        <div class="portal-actions">
          <el-button
            class="palette-trigger desktop-only"
            text
            :icon="Search"
            aria-label="Search the workspace (Ctrl+K)"
            @click="openPalette"
          >
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </el-button>
          <el-button
            class="mobile-only"
            text
            circle
            :icon="Search"
            aria-label="Search the workspace"
            @click="openPalette"
          />
          <NotificationBell v-if="loggedIn" />
          <el-dropdown class="desktop-only" trigger="click" @command="setTheme">
            <el-button
              class="theme-switcher"
              text
              :aria-label="`Theme: ${activeTheme.label}`"
            >
              <el-icon><component :is="activeThemeIcon" /></el-icon>
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
                  <el-icon v-if="preference === option.value" class="theme-option__check">
                    <Check />
                  </el-icon>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown v-if="loggedIn" trigger="click">
            <el-avatar
              :size="30"
              :src="avatarFailed ? undefined : accountImage"
              fit="cover"
              class="header-avatar"
              :aria-label="accountName"
              @error="avatarFailed = true"
            >
              {{ accountInitials }}
            </el-avatar>
            <template #dropdown>
              <el-dropdown-menu>
                <div class="account-summary">
                  <el-avatar
                    :size="36"
                    :src="avatarFailed ? undefined : accountImage"
                    fit="cover"
                  >
                    {{ accountInitials }}
                  </el-avatar>
                  <div>
                    <strong>{{ accountName }}</strong>
                    <small>Signed in</small>
                  </div>
                </div>
                <el-dropdown-item divided @click="navigateTo('/settings')">
                  <el-icon><Setting /></el-icon> Settings
                </el-dropdown-item>
                <el-dropdown-item @click="logout">
                  <el-icon><SwitchButton /></el-icon> Sign out
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button
            v-else
            class="mobile-only"
            text
            :icon="Right"
            aria-label="Sign in"
            @click="signInWithDevConnect"
          />
        </div>
      </el-header>

      <el-main id="main-content" class="portal-main" tabindex="-1">
        <el-alert
          v-if="updateReady"
          class="update-banner"
          title="A new portal version is available"
          type="info"
          :closable="false"
          show-icon
        >
          <el-button size="small" type="primary" @click="applyUpdate">
            Reload to update
          </el-button>
        </el-alert>
        <slot />
      </el-main>
    </el-container>
  </el-container>

  <AppBottomNav
    :items="primaryNavigation"
    :active-path="activeNavigationPath"
    :style="{ gridTemplateColumns: `repeat(${bottomColumns}, 1fr)` }"
    @more="moreOpen = true"
  />

  <el-drawer
    v-model="moreOpen"
    title="Workspace"
    direction="btt"
    size="82%"
    class="more-drawer"
  >
    <nav class="more-nav" aria-label="All destinations">
      <NuxtLink
        v-for="item in navigation"
        :key="item.path"
        :to="item.enabled === false ? undefined : item.path"
        class="more-nav__item"
        :class="{
          'is-active': activeNavigationPath === item.path,
          'is-disabled': item.enabled === false,
        }"
        @click="item.enabled === false ? undefined : (moreOpen = false)"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
        <el-icon v-if="activeNavigationPath === item.path" class="more-nav__check">
          <Check />
        </el-icon>
      </NuxtLink>
    </nav>

    <el-divider />

    <div class="more-section">
      <span class="more-section__label">Theme</span>
      <div class="more-theme">
        <el-button
          v-for="option in themeOptions"
          :key="option.value"
          :type="preference === option.value ? 'primary' : 'default'"
          :plain="preference !== option.value"
          :icon="option.icon"
          @click="setTheme(option.value)"
        >
          {{ option.label }}
        </el-button>
      </div>
    </div>

    <div v-if="installAvailable" class="more-section">
      <span class="more-section__label">Install app</span>
      <el-button :icon="Download" @click="handleInstall">Add to home screen</el-button>
    </div>

    <div class="more-section more-section--account">
      <template v-if="loggedIn">
        <div class="more-account">
          <el-avatar :size="40" :src="avatarFailed ? undefined : accountImage">
            {{ accountInitials }}
          </el-avatar>
          <div>
            <strong>{{ accountName }}</strong>
            <small>Signed in with DevConnect</small>
          </div>
        </div>
        <div class="more-actions">
          <el-button :icon="Setting" @click="navigateTo('/settings'); moreOpen = false">
            Settings
          </el-button>
          <el-button :icon="SwitchButton" :loading="loggingOut" @click="logout">
            Sign out
          </el-button>
        </div>
      </template>
      <el-button v-else type="primary" :icon="Right" @click="signInWithDevConnect">
        Sign in with DevConnect
      </el-button>
    </div>
  </el-drawer>

  <CommandPalette />

  <el-dialog v-model="helpVisible" title="Keyboard shortcuts" width="min(520px, 94vw)">
    <dl class="shortcut-list">
      <div><dt><kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd></dt><dd>Search and jump</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>o</kbd></dt><dd>Overview</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>t</kbd></dt><dd>Tasks</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>p</kbd></dt><dd>Projects</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>i</kbd></dt><dd>Incidents</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>c</kbd></dt><dd>Calendar</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>a</kbd></dt><dd>Assets</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>u</kbd></dt><dd>Users</dd></div>
      <div><dt><kbd>g</kbd> then <kbd>s</kbd></dt><dd>Settings</dd></div>
      <div><dt><kbd>?</kbd></dt><dd>This help</dd></div>
    </dl>
  </el-dialog>
</template>

<style scoped>
.portal-shell {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--surface-page);
}

.portal-body {
  height: 100%;
  min-height: 0;
}

.portal-aside {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface-card);
  border-right: 1px solid var(--border-subtle);
}

.portal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 64px;
  padding: 0 18px;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 650;
  text-decoration: none;
  border-bottom: 1px solid var(--border-subtle);
}

.portal-brand__mark {
  display: grid;
  width: 30px;
  height: 30px;
  color: var(--accent-contrast);
  background: var(--accent);
  border-radius: 8px;
  font-weight: 700;
  place-items: center;
}

.portal-menu {
  flex: 1 1 auto;
  min-height: 0;
  padding-top: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-right: 0;
}

.portal-menu :deep(.el-menu-item) {
  gap: 10px;
  height: 40px;
  margin: 2px 10px;
  padding: 0 12px !important;
  border-radius: var(--radius-sm);
}

.portal-menu :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary-light-9);
}

.portal-account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid var(--border-subtle);
}

.portal-account__identity {
  min-width: 0;
  flex: 1;
}

.portal-account strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portal-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 24px;
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-subtle);
}

.portal-header__title {
  min-width: 0;
}

.portal-header__title strong {
  font-size: 16px;
}

.portal-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.palette-trigger {
  gap: 8px;
  color: var(--text-muted);
}

.palette-trigger kbd {
  padding: 1px 5px;
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
}

.header-avatar {
  cursor: pointer;
}

.theme-option__check {
  margin-left: auto;
  color: var(--accent);
}

.portal-main {
  min-width: 0;
  min-height: 0;
  padding: 28px 32px 48px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  scroll-padding-bottom: calc(84px + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}

.update-banner {
  margin-bottom: 16px;
}

.account-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
}

.account-summary div {
  display: grid;
}

.account-summary strong {
  font-size: 13px;
}

.account-summary small {
  color: var(--text-muted);
  font-size: 11px;
}

.more-nav {
  display: grid;
  gap: 2px;
}

.more-nav__item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 10px;
  color: var(--text-primary);
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.more-nav__item.is-active {
  color: var(--accent);
  background: var(--el-color-primary-light-9);
}

.more-nav__item.is-disabled {
  color: var(--text-muted);
  opacity: 0.55;
  pointer-events: none;
}

.more-nav__check {
  color: var(--accent);
}

.more-section {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.more-section__label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.more-theme,
.more-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.more-account {
  display: flex;
  align-items: center;
  gap: 10px;
}

.more-account div {
  display: grid;
}

.more-account small {
  color: var(--text-muted);
  font-size: 12px;
}

.shortcut-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.shortcut-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.shortcut-list dt {
  color: var(--text-secondary);
  font-size: 13px;
}

.shortcut-list dd {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
}

.shortcut-list kbd {
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
}

@media (max-width: 1023px) and (min-width: 768px) {
  .portal-aside {
    width: 72px !important;
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
    padding: 12px 0;
  }

  .portal-main {
    padding: 24px;
  }
}

@media (max-width: 767px) {
  .portal-aside {
    display: none;
  }

  .portal-header {
    height: 56px;
    padding: 0 12px;
    gap: 8px;
  }

  .portal-header__title {
    flex: 1;
  }

  .portal-header__title strong {
    display: block;
    overflow: hidden;
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .portal-main {
    padding: 16px 14px calc(84px + env(safe-area-inset-bottom));
  }

  .portal-actions {
    gap: 2px;
  }
}
</style>

<style>
.more-drawer .el-drawer__body {
  padding-top: 4px;
}
</style>
