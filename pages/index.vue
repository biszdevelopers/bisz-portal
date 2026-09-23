<script setup lang="ts">
type User = {
  id: string
  name: string | null
}

type MeResponse = {
  user?: User
  error_description?: string
}

const headers = useRequestHeaders(["cookie"])
const { data, error, status } = await useFetch<MeResponse>("/api/me", { headers })

const user = computed(() => data.value?.user)
const message = computed(() => data.value?.error_description ?? error.value?.message ?? "Unable to load the current user")

async function signInWithDevConnect() {
  await navigateTo("/api/auth/callback/basis-auth", { external: true })
}
</script>

<template>
  <section>
    <header class="page-header">
      <h1 v-if="user">Hello, {{ user.name ?? "User" }}</h1>
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
        <el-descriptions-item label="User ID">{{ user.id }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card v-else class="profile-card" shadow="never">
      <template #header>Welcome to Basis Portal</template>
      <el-alert :title="message" type="info" :closable="false" show-icon />
      <el-button class="sign-in-button" type="primary" @click="signInWithDevConnect">
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
