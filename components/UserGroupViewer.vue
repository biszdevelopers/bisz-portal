<script setup lang="ts">
import { Delete } from "@element-plus/icons-vue";

export type UserGroupViewerUser = {
  userId: string;
  displayName: string;
  image: string | null;
  role: string;
  disabled?: boolean;
};

export type UserGroupViewerRole = {
  label: string;
  value: string;
};

const props = withDefaults(
  defineProps<{
    users: UserGroupViewerUser[];
    roles: UserGroupViewerRole[];
    editableRoles?: boolean;
    removable?: boolean;
    loading?: boolean;
    emptyText?: string;
    protectedUserIds?: string[];
  }>(),
  {
    editableRoles: false,
    removable: false,
    loading: false,
    emptyText: "No users in this group",
    protectedUserIds: () => [],
  },
);

const emit = defineEmits<{
  updateRole: [user: UserGroupViewerUser, role: string];
  remove: [user: UserGroupViewerUser];
}>();

const roleLabels = computed(
  () => new Map(props.roles.map((role) => [role.value, role.label])),
);

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}
</script>

<template>
  <el-table class="desktop-table" v-loading="loading" :data="users" :empty-text="emptyText">
    <el-table-column label="User" min-width="240">
      <template #default="{ row }">
        <NuxtLink
          class="user-group-viewer__identity"
          :to="`/users/${encodeURIComponent(row.userId)}`"
        >
          <el-avatar :src="row.image || undefined">
            {{ initials(row.displayName) }}
          </el-avatar>
          <span>
            <strong>{{ row.displayName }}</strong>
            <small>{{ row.userId }}</small>
          </span>
          <el-tag v-if="row.disabled" type="danger" size="small">
            Disabled
          </el-tag>
        </NuxtLink>
      </template>
    </el-table-column>
    <el-table-column label="Role" width="190">
      <template #default="{ row }">
        <el-select
          v-if="editableRoles"
          :model-value="row.role"
          :aria-label="`Role for ${row.displayName}`"
          @change="emit('updateRole', row as UserGroupViewerUser, String($event))"
        >
          <el-option
            v-for="role in roles"
            :key="role.value"
            :label="role.label"
            :value="role.value"
          />
        </el-select>
        <el-tag v-else effect="plain">
          {{ roleLabels.get(row.role) ?? row.role }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column v-if="removable" label="" width="70" align="right">
      <template #default="{ row }">
        <el-button
          v-if="!protectedUserIds.includes(row.userId)"
          text
          type="danger"
          :icon="Delete"
          :aria-label="`Remove ${row.displayName}`"
          @click="emit('remove', row as UserGroupViewerUser)"
        />
      </template>
    </el-table-column>
  </el-table>

  <div class="mobile-card-list">
    <article v-for="user in users" :key="user.userId" class="user-group-card surface">
      <NuxtLink class="user-group-viewer__identity" :to="`/users/${encodeURIComponent(user.userId)}`">
        <el-avatar :size="34" :src="user.image || undefined">
          {{ initials(user.displayName) }}
        </el-avatar>
        <span>
          <strong>{{ user.displayName }}</strong>
          <small>{{ roleLabels.get(user.role) ?? user.role }}</small>
        </span>
      </NuxtLink>
      <div class="user-group-card__actions">
        <el-select
          v-if="editableRoles"
          :model-value="user.role"
          size="small"
          :aria-label="`Role for ${user.displayName}`"
          @change="emit('updateRole', user as UserGroupViewerUser, String($event))"
        >
          <el-option v-for="role in roles" :key="role.value" :label="role.label" :value="role.value" />
        </el-select>
        <el-button
          v-if="removable && !protectedUserIds.includes(user.userId)"
          text
          type="danger"
          :icon="Delete"
          :aria-label="`Remove ${user.displayName}`"
          @click="emit('remove', user as UserGroupViewerUser)"
        />
      </div>
    </article>
    <el-empty v-if="!users.length" :image-size="64" :description="emptyText" />
  </div>
</template>

<style scoped>
.user-group-viewer__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.user-group-viewer__identity > span {
  display: grid;
  min-width: 0;
}

.user-group-viewer__identity strong,
.user-group-viewer__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-group-viewer__identity small {
  color: var(--el-text-color-secondary);
  font: 12px/1.5 var(--el-font-family);
}

.user-group-viewer__identity:hover strong,
.user-group-viewer__identity:focus-visible strong {
  color: var(--el-color-primary);
}

.user-group-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
}

.user-group-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
