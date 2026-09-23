<script setup lang="ts">
import {
  Bell,
  Calendar,
  DocumentChecked,
  Grid,
  Right,
  UserFilled,
  WarningFilled,
} from "@element-plus/icons-vue"

const route = useRoute()
const { loggedIn, user } = useUserSession()

const navigation = [
  { label: "Overview", path: "/", icon: Grid },
  { label: "Tasks", path: "/tasks", icon: DocumentChecked },
  { label: "Incidents", path: "/incidents", icon: WarningFilled },
  { label: "Calendar", path: "/calendar", icon: Calendar },
  { label: "Groups", path: "/groups", icon: UserFilled },
]

const pageTitle = computed(
  () => navigation.find((item) => item.path === route.path)?.label ?? "Portal",
)

const accountName = computed(() => user.value?.name || (loggedIn.value ? "Basis user" : "Not signed in"))
const accountDetail = computed(() => loggedIn.value ? "Signed in" : "Guest session")
const accountImage = computed(() => user.value?.image || undefined)
const accountInitials = computed(() => {
  const source = user.value?.name || (loggedIn.value ? "Basis user" : "Guest")
  const words = source.trim().split(/\s+/).filter(Boolean)

  return (words.length > 1 ? `${words[0]?.[0]}${words.at(-1)?.[0]}` : source.slice(0, 2)).toUpperCase()
})

async function signInWithDevConnect() {
  await navigateTo("/api/auth/callback/basis-auth", { external: true })
}
</script>

<template>
  <el-container class="portal-shell">
    <el-aside class="portal-aside" width="220px">
      <NuxtLink class="portal-brand" to="/" aria-label="Basis Portal">
        <span class="portal-brand__mark">B</span>
        <span>Basis Portal</span>
      </NuxtLink>

      <el-menu class="portal-menu" :default-active="route.path" router>
        <el-menu-item v-for="item in navigation" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span class="menu-label">{{ item.label }}</span>
          <el-tag v-if="item.path === '/incidents'" class="incident-count" type="danger" effect="dark" size="small" round>
            3
          </el-tag>
        </el-menu-item>
      </el-menu>

      <div class="portal-account">
        <el-avatar :size="32" :src="accountImage">{{ accountInitials }}</el-avatar>
        <span>
          <strong>{{ accountName }}</strong>
          <small>{{ accountDetail }}</small>
        </span>
        <el-button
          v-if="!loggedIn"
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
        <el-badge is-dot class="notification-badge">
          <el-button :icon="Bell" text circle aria-label="Notifications" />
        </el-badge>
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
  background: #f5f7fa;
}

.portal-aside {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #e4e7ed;
}

.portal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 20px;
  color: #303133;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid #e4e7ed;
}

.portal-brand__mark {
  display: grid;
  width: 30px;
  height: 30px;
  color: #fff;
  background: #409eff;
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
  background: #ecf5ff;
}

.incident-count {
  margin-left: auto;
  pointer-events: none;
}

.portal-account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #e4e7ed;
}

.portal-account :deep(.el-avatar) {
  color: #409eff;
  font-size: 12px;
  font-weight: 600;
  background: #ecf5ff;
}

.portal-account strong,
.portal-account small {
  display: block;
}

.portal-account > span {
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

.portal-account strong {
  color: #303133;
  font-size: 12px;
  font-weight: 500;
}

.portal-account small {
  margin-top: 2px;
  color: #909399;
  font-size: 11px;
}

.portal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.notification-badge :deep(.el-badge__content.is-fixed) {
  top: 7px;
  right: 7px;
}

.portal-main {
  padding: 28px 32px;
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
  .portal-account > span {
    display: none;
  }

  .portal-menu :deep(.el-menu-item) {
    justify-content: center;
    padding: 0 !important;
  }

  .incident-count {
    position: absolute;
    top: 8px;
    right: 8px;
    margin-left: 0;
    transform: scale(0.8);
    transform-origin: top right;
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
}
</style>
