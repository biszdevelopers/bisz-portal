<script setup lang="ts">
const { capabilities, pending, error } = usePortalAccess();
useHead({ title: "Resource Servers · DevConnect" });
</script>

<template>
  <section class="page" v-loading="pending">
    <header class="page-header">
      <h1>Resource Servers</h1>
    </header>

    <BackendErrorDetails v-if="error" :error="error" />
    <ResourceServersTable v-else-if="capabilities.resourcesRead" />
    <AccessDenied
      v-else-if="!pending"
      description="You need BiszPortal.Resources.read.me or BiszPortal.Resources.read.others."
    />
  </section>
</template>
