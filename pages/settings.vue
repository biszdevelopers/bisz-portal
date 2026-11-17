<script setup lang="ts">
import { Bell, Download, SwitchButton } from "@element-plus/icons-vue";
import type {
  NotificationPreferences,
  NotificationPreferenceKey,
} from "~/shared/contracts";
import { usePwa } from "~/composables/usePwa";
import { initials } from "~/utils/format";
import type { ThemePreference } from "~/composables/useTheme";

const { user, loggedIn, clear: clearUserSession } = useUserSession();
const { preference, setTheme } = useTheme();
const {
  supported: pushSupported,
  permission,
  subscribed,
  installAvailable,
  install,
  enablePush,
  disablePush,
  refreshSubscriptionState,
} = usePwa();

const preferences = ref<NotificationPreferences | null>(null);
const saving = ref(false);
const enabling = ref(false);
const error = ref("");
const pushKey = ref<string | null>(null);

const typeLabels: Array<{ key: NotificationPreferenceKey; label: string; description: string }> = [
  { key: "taskAssigned", label: "Task assignments", description: "When someone assigns a task to you." },
  { key: "reviewRequested", label: "Review requests", description: "When a task is submitted for review in your project." },
  { key: "dueSoon", label: "Due reminders", description: "When an assigned task is due tomorrow or overdue." },
  { key: "incidentUpdates", label: "Incident updates", description: "New incidents, assignments, and resolutions." },
  { key: "membershipChanges", label: "Project membership", description: "When you are added, removed, or your permissions change." },
  { key: "mentions", label: "Mentions", description: "When someone mentions you in a comment." },
  { key: "replies", label: "Replies", description: "When someone replies in a comment thread you participated in." },
];

const themeOptions: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

async function loadPreferences() {
  try {
    const response = await $fetch<{
      preferences: NotificationPreferences;
      pushConfigured: boolean;
    }>("/api/notifications/preferences");
    preferences.value = response.preferences;
  } catch (caught) {
    error.value = backendErrorMessage(caught, "Notification preferences could not be loaded.");
  }
}

async function savePreferences() {
  if (!preferences.value || saving.value) return;
  saving.value = true;
  try {
    const response = await $fetch<{ preferences: NotificationPreferences }>(
      "/api/notifications/preferences",
      { method: "PUT", body: preferences.value },
    );
    preferences.value = response.preferences;
    ElMessage.success("Notification preferences saved");
  } catch (caught) {
    ElMessage.error(backendErrorMessage(caught, "Preferences could not be saved."));
  } finally {
    saving.value = false;
  }
}

async function enableSystemNotifications() {
  enabling.value = true;
  try {
    const key = await $fetch<{ enabled: boolean; publicKey: string | null }>(
      "/api/notifications/push/key",
    );
    if (!key.enabled || !key.publicKey)
      throw new Error("Push notifications are not configured.");
    pushKey.value = key.publicKey;
    await enablePush(key.publicKey);
    await refreshSubscriptionState();
    ElMessage.success("System notifications enabled");
  } catch (caught) {
    ElMessage.error(
      caught instanceof Error ? caught.message : "System notifications could not be enabled.",
    );
  } finally {
    enabling.value = false;
  }
}

async function disableSystemNotifications() {
  enabling.value = true;
  try {
    await disablePush();
    ElMessage.success("System notifications disabled");
  } catch (caught) {
    ElMessage.error(
      caught instanceof Error ? caught.message : "System notifications could not be disabled.",
    );
  } finally {
    enabling.value = false;
  }
}

async function logout() {
  await $fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  await clearUserSession().catch(() => undefined);
  clearNuxtData();
  await navigateTo("/");
}

onMounted(() => {
  void loadPreferences();
  void refreshSubscriptionState();
});

useHead({ title: "Settings · DevConnect" });
</script>

<template>
  <section class="page settings-page">
    <PageHeader title="Settings" description="Your account, appearance, and notification preferences." />

    <BackendErrorDetails v-if="error" :error="error" />

    <div class="settings-grid">
      <section class="surface settings-card">
        <h2>Account</h2>
        <div v-if="loggedIn" class="account-row">
          <el-avatar :size="44" :src="user?.image ?? undefined">
            {{ initials(user?.name) }}
          </el-avatar>
          <div>
            <strong>{{ user?.name ?? "Basis user" }}</strong>
            <small>Signed in with DevConnect</small>
          </div>
        </div>
        <el-button v-if="loggedIn" :icon="SwitchButton" @click="logout">Sign out</el-button>
      </section>

      <section class="surface settings-card">
        <h2>Appearance</h2>
        <p class="muted">Choose how the portal looks on this device.</p>
        <el-segmented
          :model-value="preference"
          :options="themeOptions.map((option) => ({ label: option.label, value: option.value }))"
          @change="(value: ThemePreference) => setTheme(value)"
        />
      </section>

      <section class="surface settings-card">
        <h2>Install app</h2>
        <p class="muted">
          Install DevConnect for a full-screen experience and system notifications.
        </p>
        <el-button v-if="installAvailable" :icon="Download" @click="install">
          Add to home screen
        </el-button>
        <p v-else class="muted">
          Use your browser menu to install the app. On iPhone or iPad, use Share → Add to Home Screen.
        </p>
      </section>

      <section id="notifications" class="surface settings-card settings-card--wide">
        <h2>Notifications</h2>
        <div class="push-row">
          <div>
            <strong>System notifications</strong>
            <p class="muted">
              Deliver notifications to this device through the browser. Requires HTTPS
              and permission.
            </p>
          </div>
          <el-button
            v-if="!subscribed"
            type="primary"
            :icon="Bell"
            :loading="enabling"
            :disabled="!pushSupported || permission === 'denied'"
            @click="enableSystemNotifications"
          >
            {{ permission === "denied" ? "Blocked in browser" : "Enable" }}
          </el-button>
          <el-button v-else :loading="enabling" @click="disableSystemNotifications">
            Disable
          </el-button>
        </div>
        <el-alert
          v-if="permission === 'denied'"
          type="warning"
          :closable="false"
          title="Notifications are blocked"
          description="Allow notifications for this site in your browser settings, then reload."
        />

        <div v-if="preferences" class="preference-list">
          <label v-for="entry in typeLabels" :key="entry.key" class="preference-row">
            <el-checkbox v-model="preferences.types[entry.key]" />
            <span>
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.description }}</small>
            </span>
          </label>
          <div class="quiet-hours">
            <el-checkbox v-model="preferences.quietHours.enabled">Quiet hours</el-checkbox>
            <el-time-picker
              v-model="preferences.quietHours.start"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="Start"
              :disabled="!preferences.quietHours.enabled"
            />
            <span>to</span>
            <el-time-picker
              v-model="preferences.quietHours.end"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="End"
              :disabled="!preferences.quietHours.enabled"
            />
          </div>
        </div>
        <el-button type="primary" :loading="saving" @click="savePreferences">
          Save notification preferences
        </el-button>
      </section>

      <section class="surface settings-card">
        <h2>Connections</h2>
        <p class="muted">
          Assets uses a separate DevConnect authorization. Manage it from the Assets page.
        </p>
        <el-button @click="navigateTo('/assets')">Open Assets</el-button>
      </section>
    </div>
  </section>
</template>

<style scoped>
.settings-page {
  display: grid;
  gap: 16px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-card {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 16px;
}

.settings-card--wide {
  grid-column: 1 / -1;
}

.settings-card h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.account-row div {
  display: grid;
}

.account-row small {
  color: var(--text-muted);
  font-size: 12px;
}

.push-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px;
  background: var(--surface-subtle);
  border-radius: var(--radius-sm);
}

.push-row p {
  margin: 2px 0 0;
  font-size: 12px;
}

.preference-list {
  display: grid;
  gap: 4px;
}

.preference-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 7px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.preference-row:hover {
  background: var(--surface-subtle);
}

.preference-row span {
  display: grid;
  gap: 1px;
}

.preference-row strong {
  font-size: 13px;
  font-weight: 600;
}

.preference-row small {
  color: var(--text-muted);
  font-size: 11px;
}

.quiet-hours {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

@media (max-width: 767px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .push-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
