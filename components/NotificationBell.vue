<script setup lang="ts">
import { Bell, Check, Setting } from "@element-plus/icons-vue";
import type {
  NotificationPage,
  NotificationSummary,
  NotificationView,
} from "~/shared/contracts";
import { timeAgo } from "~/utils/format";
import { useViewport } from "~/composables/useViewport";
import { usePwa } from "~/composables/usePwa";

const config = useRuntimeConfig();
const { loggedIn } = useUserSession();
const { isMobile } = useViewport();
const {
  supported: pushSupported,
  permission,
  subscribed,
  enablePush,
  refreshSubscriptionState,
} = usePwa();

const open = ref(false);
const loading = ref(false);
const unread = ref(0);
const items = ref<NotificationView[]>([]);
const nextCursor = ref<string | null>(null);
const error = ref("");
const enabling = ref(false);
let poller: ReturnType<typeof setInterval> | undefined;

const pushAvailable = computed(
  () => config.public.pushEnabled && pushSupported.value,
);
const showEnable = computed(
  () =>
    pushAvailable.value &&
    (permission.value === "default" || !subscribed.value),
);

async function loadSummary() {
  if (!loggedIn.value) {
    unread.value = 0;
    return;
  }
  try {
    const summary = await $fetch<NotificationSummary>(
      "/api/notifications/summary",
    );
    unread.value = summary.unread;
  } catch {
    unread.value = 0;
  }
}

async function loadNotifications(reset = true) {
  loading.value = true;
  error.value = "";
  try {
    const page = await $fetch<NotificationPage>("/api/notifications", {
      query: {
        limit: 20,
        ...(reset || !nextCursor.value ? {} : { cursor: nextCursor.value }),
      },
    });
    items.value = reset ? page.notifications : [...items.value, ...page.notifications];
    nextCursor.value = page.nextCursor;
    unread.value = page.unread;
  } catch (caught) {
    error.value = backendErrorMessage(caught, "Notifications could not be loaded.");
  } finally {
    loading.value = false;
  }
}

async function openPanel() {
  open.value = true;
  await loadNotifications(true);
}

function closePanel() {
  open.value = false;
}

async function markAllRead() {
  if (!unread.value) return;
  try {
    const result = await $fetch<{ summary: NotificationSummary }>(
      "/api/notifications/read-all",
      { method: "POST" },
    );
    unread.value = result.summary.unread;
    items.value = items.value.map((item) => ({
      ...item,
      readAt: item.readAt ?? new Date().toISOString(),
    }));
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "Could not mark notifications as read."));
  }
}

async function openNotification(item: NotificationView) {
  const url = item.url.startsWith("/") && !item.url.startsWith("//")
    ? item.url
    : "/";
  if (!item.readAt) {
    try {
      const result = await $fetch<{ summary: NotificationSummary }>(
        "/api/notifications/read",
        { method: "POST", body: { ids: [item.id] } },
      );
      unread.value = result.summary.unread;
      item.readAt = new Date().toISOString();
    } catch {
      // Navigation still works if the read receipt fails.
    }
  }
  closePanel();
  await navigateTo(url);
}

async function enableSystemNotifications() {
  if (enabling.value) return;
  enabling.value = true;
  try {
    const key = await $fetch<{ enabled: boolean; publicKey: string | null }>(
      "/api/notifications/push/key",
    );
    if (!key.enabled || !key.publicKey)
      throw new Error("Push notifications are not configured.");
    await enablePush(key.publicKey);
    await refreshSubscriptionState();
    ElMessage.success("System notifications enabled");
  } catch (caught) {
    ElMessage.error(
      caught instanceof Error
        ? caught.message
        : "System notifications could not be enabled.",
    );
  } finally {
    enabling.value = false;
  }
}

function refreshVisibility() {
  if (document.visibilityState === "visible" && loggedIn.value)
    void loadSummary();
}

onMounted(() => {
  void loadSummary();
  poller = setInterval(() => {
    if (document.visibilityState === "visible" && loggedIn.value)
      void loadSummary();
  }, 60_000);
  document.addEventListener("visibilitychange", refreshVisibility);
});

onBeforeUnmount(() => {
  if (poller) clearInterval(poller);
  document.removeEventListener("visibilitychange", refreshVisibility);
});

watch(open, (value) => {
  if (!value) return;
  void refreshSubscriptionState();
});
</script>

<template>
  <el-popover
    v-if="!isMobile"
    v-model:visible="open"
    placement="bottom-end"
    :width="400"
    trigger="click"
    popper-class="notification-popper"
    @show="openPanel"
  >
    <template #reference>
      <el-badge :value="unread" :hidden="!unread" :max="99">
        <el-button
          text
          circle
          :icon="Bell"
          :aria-label="`Notifications${unread ? `, ${unread} unread` : ''}`"
        />
      </el-badge>
    </template>

    <div class="notification-panel">
      <header class="notification-panel__header">
        <strong>Notifications</strong>
        <el-button
          v-if="unread"
          text
          size="small"
          :icon="Check"
          @click="markAllRead"
          >Mark all read</el-button
        >
      </header>
      <div v-loading="loading" class="notification-panel__body">
        <p v-if="error" class="notification-panel__error">{{ error }}</p>
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="notification-item"
          :class="{ 'is-unread': !item.readAt }"
          @click="openNotification(item)"
        >
          <span class="notification-item__dot" />
          <span class="notification-item__content">
            <strong>{{ item.title }}</strong>
            <small v-if="item.body">{{ item.body }}</small>
            <small>{{ timeAgo(item.createdAt) }}</small>
          </span>
        </button>
        <el-empty
          v-if="!items.length && !loading && !error"
          :image-size="64"
          description="You are all caught up."
        />
        <el-button
          v-if="nextCursor"
          text
          class="notification-more"
          @click="loadNotifications(false)"
          >Load more</el-button
        >
      </div>
      <footer class="notification-panel__footer">
        <el-button v-if="showEnable" text :icon="Bell" :loading="enabling" @click="enableSystemNotifications">
          Enable system notifications
        </el-button>
        <NuxtLink to="/settings#notifications" @click="closePanel">
          <el-icon><Setting /></el-icon>
          Notification settings
        </NuxtLink>
      </footer>
    </div>
  </el-popover>

  <template v-else>
    <el-badge :value="unread" :hidden="!unread" :max="99">
      <el-button
        text
        circle
        :icon="Bell"
        :aria-label="`Notifications${unread ? `, ${unread} unread` : ''}`"
        @click="openPanel"
      />
    </el-badge>
    <el-drawer
      v-model="open"
      title="Notifications"
      direction="btt"
      size="78%"
      class="notification-drawer"
    >
      <div class="notification-panel">
        <header class="notification-panel__header">
          <span />
          <el-button
            v-if="unread"
            text
            size="small"
            :icon="Check"
            @click="markAllRead"
            >Mark all read</el-button
          >
        </header>
        <div v-loading="loading" class="notification-panel__body">
          <p v-if="error" class="notification-panel__error">{{ error }}</p>
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="notification-item"
            :class="{ 'is-unread': !item.readAt }"
            @click="openNotification(item)"
          >
            <span class="notification-item__dot" />
            <span class="notification-item__content">
              <strong>{{ item.title }}</strong>
              <small v-if="item.body">{{ item.body }}</small>
              <small>{{ timeAgo(item.createdAt) }}</small>
            </span>
          </button>
          <el-empty
            v-if="!items.length && !loading && !error"
            :image-size="64"
            description="You are all caught up."
          />
          <el-button
            v-if="nextCursor"
            text
            class="notification-more"
            @click="loadNotifications(false)"
            >Load more</el-button
          >
        </div>
        <footer class="notification-panel__footer">
          <el-button v-if="showEnable" text :icon="Bell" :loading="enabling" @click="enableSystemNotifications">
            Enable system notifications
          </el-button>
          <NuxtLink to="/settings#notifications" @click="closePanel">
            <el-icon><Setting /></el-icon>
            Notification settings
          </NuxtLink>
        </footer>
      </div>
    </el-drawer>
  </template>
</template>

<style scoped>
.notification-panel {
  display: grid;
  gap: 8px;
}

.notification-panel__header,
.notification-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notification-panel__footer {
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  font-size: 13px;
}

.notification-panel__footer a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  text-decoration: none;
}

.notification-panel__body {
  display: grid;
  max-height: 420px;
  gap: 4px;
  overflow-y: auto;
}

.notification-item {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 10px;
  width: 100%;
  padding: 10px;
  color: var(--text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.notification-item:hover {
  background: var(--surface-subtle);
}

.notification-item__dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  background: transparent;
  border-radius: 50%;
}

.notification-item.is-unread .notification-item__dot {
  background: var(--accent);
}

.notification-item__content {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.notification-item__content strong,
.notification-item__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-item__content strong {
  font-size: 13px;
  font-weight: 600;
}

.notification-item__content small {
  color: var(--text-muted);
  font-size: 11px;
}

.notification-panel__error {
  margin: 0;
  color: var(--status-danger);
  font-size: 12px;
}

.notification-more {
  justify-self: center;
}
</style>

<style>
.notification-popper {
  padding: 12px !important;
}

.notification-drawer .el-drawer__body {
  padding-top: 0;
}
</style>
