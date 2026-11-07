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
  <el-table v-loading="loading" :data="users" :empty-text="emptyText">
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
</style>
