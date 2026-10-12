<script setup lang="ts">
type User = {
  id: string;
  name: string | null;
};

type MeResponse = {
  user?: User;
};

const headers = useRequestHeaders(["cookie"]);
const { data, error, status } = await useFetch<MeResponse>("/api/me", {
  headers,
});

const user = computed(() => data.value?.user);

async function signInWithDevConnect() {
  await navigateTo("/api/auth/callback/basis-auth", { external: true });
}

enum TimeOfDay {
  Morning = "MORNING",
  Afternoon = "AFTERNOON",
  Evening = "EVENING",
}

function getCurrentTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hours = date.getHours();

  if (hours >= 5 && hours < 12) {
    return TimeOfDay.Morning;
  }

  if (hours >= 12 && hours < 17) {
    return TimeOfDay.Afternoon;
  }

  // Covers 17:00 through 04:59
  return TimeOfDay.Evening;
}

const timeOfDay = computed(() => getCurrentTimeOfDay());
</script>

<template>
  <section>
    <header class="page-header">
      <h1 v-if="user">
        <h1 v-if="timeOfDay == TimeOfDay.Morning">
          Good morning! {{ user.name ?? "User" }}
        </h1>
        <h1 v-else-if="timeOfDay == TimeOfDay.Afternoon">
          Good afternoon! {{ user.name ?? "User" }}
        </h1>
        <h1 v-else>Good evening! {{ user.name ?? "User" }}</h1>
      </h1>
      <h1 v-else>Overview</h1>
      <p v-if="user">Your Basis profile and workspace details.</p>
      <p v-else>Your Basis workspace at a glance.</p>
    </header>

    <el-card v-if="status === 'pending'" class="profile-card" shadow="never">
      <el-skeleton :rows="2" animated />
    </el-card>

    <el-card v-else-if="user" class="profile-card" shadow="never">
      <template #header>Current signed-in user</template>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="User ID">{{
          user.id
        }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card v-else class="profile-card" shadow="never">
      <template #header>Welcome to Basis Portal</template>
      <BackendErrorDetails
        v-if="error"
        :error="error"
        fallback-description="Unable to load the current user."
      />
      <el-alert
        v-else
        title="Sign in to load your Basis profile."
        type="info"
        :closable="false"
        show-icon
      />
      <el-button
        class="sign-in-button"
        type="primary"
        @click="signInWithDevConnect"
      >
        Sign in with DevConnect
      </el-button>
    </el-card>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 720px;
}

.sign-in-button {
  margin-top: 20px;
}
</style>
