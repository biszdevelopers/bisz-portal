<script setup lang="ts">
import {
  CopyDocument,
  Delete,
  EditPen,
  Link,
  Plus,
  Refresh,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  ApplicationDetail,
  ApplicationOwnerView,
  ApplicationResourceView,
  ApplicationRole,
} from "~/shared/contracts";

const route = useRoute();
const clientId = computed(() => String(route.params.clientId ?? ""));
const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
const { data, pending, error, refresh } = await useFetch<{
  application: ApplicationDetail;
}>(() => `/api/applications/${encodeURIComponent(clientId.value)}`, {
  headers,
});
const application = computed(() => data.value?.application);
const activeTab = ref("owners");
const saving = ref(false);
const requestError = shallowRef<unknown>(null);
const settingsDialog = ref(false);
const settingsForm = reactive({
  name: "",
  requireConsent: true,
  filterMode: null as "whitelist" | "blacklist" | null,
  filterContentText: "",
  organizationIds: [] as string[],
});
const secretDialog = ref(false);
const clientSecret = ref("");

const ownerDialog = ref(false);
const ownerForm = reactive<{ userId: string; role: ApplicationRole }>({
  userId: "",
  role: "role.GENERAL",
});
const resourceDialog = ref(false);
const resourceMode = ref<"attach" | "create" | "edit">("attach");
const resourceForm = reactive({ resourceId: "", name: "", scopesText: "" });
const permissionDialog = ref(false);
const permissionMode = ref<"create" | "edit">("edit");
const permissionForm = reactive({ permission: "", description: "" });
const redirectDialog = ref(false);
const redirectIndex = ref<number | null>(null);
const redirectValue = ref("");
const scopeTree = ref();

const generator = reactive({
  redirectUri: "",
  resourceId: "",
  scopes: ["openid"] as string[],
  integration: false,
});
const generatorUrl = ref("");
const generatorVerifier = ref("");
const generatorState = ref("");
const generatorNonce = ref("");

const treeData = computed(() =>
  (application.value?.resources ?? []).map((resource) => ({
    id: `resource:${resource.resourceId}`,
    label: resource.name,
    children: resource.availableScopes.map((scope) => ({
      id: `${resource.resourceId}\u0000${scope}`,
      label: scope,
    })),
  })),
);
const checkedScopeKeys = computed(() =>
  (application.value?.resources ?? []).flatMap((resource) =>
    resource.grantedScopes.map(
      (scope) => `${resource.resourceId}\u0000${scope}`,
    ),
  ),
);
const selectedGeneratorResource = computed(() =>
  application.value?.resources.find(
    (resource) => resource.resourceId === generator.resourceId,
  ),
);
const generatorScopeOptions = computed(
  () => selectedGeneratorResource.value?.grantedScopes ?? [],
);

watch(
  application,
  (value) => {
    if (!value) return;
    if (!generator.redirectUri)
      generator.redirectUri = value.redirectUris[0] ?? "";
    if (
      !generator.resourceId ||
      !value.resources.some(
        (resource) => resource.resourceId === generator.resourceId,
      )
    ) {
      generator.resourceId =
        value.resources.length === 1 ? value.resources[0]!.resourceId : "";
    }
  },
  { immediate: true },
);

function openSettings() {
  if (!application.value) return;
  settingsForm.name = application.value.name;
  settingsForm.requireConsent = application.value.requireConsent;
  settingsForm.filterMode = application.value.filterMode;
  settingsForm.filterContentText = application.value.filterContent.join(", ");
  settingsForm.organizationIds = [...application.value.organizationIds];
  settingsDialog.value = true;
}

async function saveSettings() {
  if (
    await mutate("", "PATCH", {
      name: settingsForm.name,
      requireConsent: settingsForm.requireConsent,
      filterMode: settingsForm.filterMode,
      filterContent: settingsForm.filterMode
        ? settingsForm.filterContentText
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [],
      organizationIds: settingsForm.organizationIds,
    })
  ) {
    settingsDialog.value = false;
    ElMessage.success("Application settings updated");
  }
}

async function deleteApplication() {
  if (!application.value) return;
  await ElMessageBox.confirm(
    `Permanently delete ${application.value.name}? OAuth grants and authorization data for this client will also be deleted.`,
    "Delete application",
    { type: "error", confirmButtonText: "Delete" },
  );
  saving.value = true;
  try {
    await $fetch(`/api/applications/${encodeURIComponent(clientId.value)}`, {
      method: "DELETE",
    });
    await navigateTo("/applications");
    ElMessage.success("Application deleted");
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(
      backendErrorMessage(caught, "The application could not be deleted."),
    );
  } finally {
    saving.value = false;
  }
}

async function rotateSecret() {
  await ElMessageBox.confirm(
    "Generate a new client secret? The current secret will stop working immediately.",
    "Rotate client secret",
    { type: "warning" },
  );
  saving.value = true;
  try {
    const response = await $fetch<{ clientSecret: string }>(
      `/api/applications/${encodeURIComponent(clientId.value)}/credentials`,
      { method: "POST" },
    );
    requestError.value = null;
    clientSecret.value = response.clientSecret;
    secretDialog.value = true;
    await refresh();
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(
      backendErrorMessage(caught, "The client secret could not be rotated."),
    );
  } finally {
    saving.value = false;
  }
}

async function makePublic() {
  await ElMessageBox.confirm(
    "Remove the client secret and make this a public client? The existing secret will stop working immediately.",
    "Make public",
    { type: "warning" },
  );
  if (await mutate("/credentials", "DELETE"))
    ElMessage.success("Application is now public");
}

watch(checkedScopeKeys, async (keys) => {
  await nextTick();
  scopeTree.value?.setCheckedKeys?.(keys);
});

async function mutate(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: Record<string, unknown>,
) {
  saving.value = true;
  try {
    const response = await $fetch<{ application: ApplicationDetail }>(
      `/api/applications/${encodeURIComponent(clientId.value)}${path}`,
      { method, body },
    );
    data.value = { ...response };
    requestError.value = null;
    return true;
  } catch (caught) {
    requestError.value = caught;
    ElMessage.error(
      backendErrorMessage(caught, "The application could not be updated."),
    );
    return false;
  } finally {
    saving.value = false;
  }
}

async function addOwner() {
  if (await mutate("/owners", "POST", ownerForm)) {
    ownerDialog.value = false;
    ownerForm.userId = "";
    ownerForm.role = "role.GENERAL";
    ElMessage.success("Member added");
  }
}

async function changeOwnerRole(owner: any, role: ApplicationRole) {
  if (
    await mutate(`/owners/${encodeURIComponent(owner.userId)}`, "PATCH", {
      role,
    })
  )
    ElMessage.success("Role updated");
}

async function removeOwner(owner: any) {
  await ElMessageBox.confirm(
    `Remove ${owner.displayName} from this application?`,
    "Remove member",
    { type: "warning" },
  );
  if (await mutate(`/owners/${encodeURIComponent(owner.userId)}`, "DELETE"))
    ElMessage.success("Member removed");
}

function openResource(mode: "attach" | "create" | "edit", resource?: any) {
  resourceMode.value = mode;
  resourceForm.resourceId = resource?.resourceId ?? "";
  resourceForm.name = resource?.name ?? "";
  resourceForm.scopesText = resource?.availableScopes.join(", ") ?? "";
  resourceDialog.value = true;
}

async function saveResource() {
  const availableScopes = [
    ...new Set(
      resourceForm.scopesText
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const request: {
    path: string;
    method: "POST" | "PATCH";
    body: Record<string, unknown>;
  } =
    resourceMode.value === "attach"
      ? {
          path: "/resources/attach",
          method: "POST",
          body: { resourceId: resourceForm.resourceId },
        }
      : {
          path: "/resources",
          method: resourceMode.value === "create" ? "POST" : "PATCH",
          body: {
            resourceId: resourceForm.resourceId,
            name: resourceForm.name,
            availableScopes,
          },
        };
  if (await mutate(request.path, request.method, request.body)) {
    resourceDialog.value = false;
    ElMessage.success(
      resourceMode.value === "attach" ? "Resource attached" : "Resource saved",
    );
  }
}

async function removeResource(resource: any, deleteDefinition: boolean) {
  const verb = deleteDefinition
    ? "delete this resource definition"
    : "detach this resource";
  await ElMessageBox.confirm(
    `Are you sure you want to ${verb}?`,
    "Resource change",
    { type: "warning" },
  );
  if (
    await mutate("/resources", "DELETE", {
      resourceId: resource.resourceId,
      deleteDefinition,
    })
  )
    ElMessage.success(
      deleteDefinition ? "Resource deleted" : "Resource detached",
    );
}

async function saveScopes() {
  const keys = (scopeTree.value?.getCheckedKeys?.() ?? []) as string[];
  const resourceScopes = Object.fromEntries(
    (application.value?.resources ?? []).map((resource) => [
      resource.resourceId,
      keys
        .filter((key) => key.startsWith(`${resource.resourceId}\u0000`))
        .map((key) => key.slice(resource.resourceId.length + 1)),
    ]),
  );
  if (await mutate("/scopes", "PUT", { resourceScopes }))
    ElMessage.success("Scope grants updated");
}

function editPermission(permission: any) {
  permissionMode.value = "edit";
  permissionForm.permission = permission.permission;
  permissionForm.description = permission.description;
  permissionDialog.value = true;
}

function createPermission() {
  permissionMode.value = "create";
  permissionForm.permission = "";
  permissionForm.description = "";
  permissionDialog.value = true;
}

async function savePermission() {
  if (
    await mutate(
      "/permissions",
      permissionMode.value === "create" ? "POST" : "PATCH",
      permissionForm,
    )
  ) {
    permissionDialog.value = false;
    ElMessage.success("Permission description updated");
  }
}

async function deletePermission(permission: any) {
  await ElMessageBox.confirm(
    `Delete ${permission.permission}? Existing user grants are not changed.`,
    "Delete permission definition",
    { type: "warning" },
  );
  if (
    await mutate("/permissions", "DELETE", {
      permission: permission.permission,
    })
  )
    ElMessage.success("Permission definition deleted");
}

function editRedirect(index: number | null) {
  redirectIndex.value = index;
  redirectValue.value =
    index === null ? "" : (application.value?.redirectUris[index] ?? "");
  redirectDialog.value = true;
}

async function saveRedirect() {
  if (!application.value) return;
  const redirectUris = [...application.value.redirectUris];
  if (redirectIndex.value === null) redirectUris.push(redirectValue.value);
  else redirectUris[redirectIndex.value] = redirectValue.value;
  if (await mutate("/redirect-uris", "PUT", { redirectUris })) {
    redirectDialog.value = false;
    ElMessage.success("Redirect URI saved");
  }
}

async function deleteRedirect(index: number) {
  if (!application.value || application.value.redirectUris.length === 1) return;
  const redirectUris = application.value.redirectUris.filter(
    (_, candidate) => candidate !== index,
  );
  if (await mutate("/redirect-uris", "PUT", { redirectUris }))
    ElMessage.success("Redirect URI removed");
}

function randomUrlSafe(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function refreshGenerator() {
  if (!application.value) return;
  const params = new URLSearchParams({
    client_id: application.value.clientId,
    response_type: "code",
    redirect_uri: generator.redirectUri,
    resource: generator.resourceId,
    scope: [...new Set(["openid", ...generator.scopes])].join(" "),
    code_challenge_method: "S256",
  });
  if (generator.integration && import.meta.client) {
    generatorState.value = randomUrlSafe();
    generatorNonce.value = randomUrlSafe();
    generatorVerifier.value = randomUrlSafe(48);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(generatorVerifier.value),
    );
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    params.set("state", generatorState.value);
    params.set("nonce", generatorNonce.value);
    params.set("code_challenge", challenge);
  } else {
    generatorState.value = "";
    generatorNonce.value = "";
    generatorVerifier.value = "";
    params.set("state", "{STATE}");
    params.set("nonce", "{NONCE}");
    params.set("code_challenge", "{S256_CODE_CHALLENGE}");
  }
  generatorUrl.value = `${application.value.authorizationEndpoint}?${params.toString()}`;
}

async function copy(value: string) {
  await navigator.clipboard.writeText(value);
  ElMessage.success("Copied");
}

watch(
  () => [
    generator.redirectUri,
    generator.resourceId,
    generator.scopes.join(" "),
    generator.integration,
  ],
  () => {
    void refreshGenerator();
  },
);
onMounted(() => void refreshGenerator());
</script>

<template>
  <section v-loading="pending">
    <header class="page-header application-header">
      <div>
        <el-link :underline="false" href="/applications">Applications</el-link>
        <h1>{{ application?.name ?? "Application" }}</h1>
        <pre v-if="application" class="client-id">{{
          application.clientId
        }}</pre>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" @click="() => refresh()">Refresh</el-button
        ><el-button
          v-if="application?.capabilities.update"
          :icon="EditPen"
          @click="openSettings"
          >Settings</el-button
        >
      </div>
    </header>

    <BackendErrorDetails
      v-if="error || requestError"
      :error="requestError || error"
    />
    <template v-if="application">
      <el-card shadow="never" class="details-card">
        <el-descriptions title="Application details" :column="2" border>
          <el-descriptions-item label="Name">{{
            application.name
          }}</el-descriptions-item>
          <el-descriptions-item label="Client ID">
            <pre>{{ application.clientId }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="Client type">
            {{ application.public ? "Public" : "Confidential" }}
            <template v-if="application.capabilities.manageCredentials">
              <el-button
                v-if="application.public"
                text
                type="primary"
                @click="rotateSecret"
                >Make confidential</el-button
              >
              <template v-else
                ><el-button text type="primary" @click="rotateSecret"
                  >Rotate secret</el-button
                ><el-button text @click="makePublic"
                  >Make public</el-button
                ></template
              >
            </template>
          </el-descriptions-item>
          <el-descriptions-item label="Consent">{{
            application.requireConsent ? "Required" : "Skipped"
          }}</el-descriptions-item>
          <el-descriptions-item label="Organizations">{{
            application.organizationIds.join(", ")
          }}</el-descriptions-item>
          <el-descriptions-item label="Account filter">{{
            application.filterMode
              ? `${application.filterMode}: ${application.filterContent.join(", ")}`
              : "None"
          }}</el-descriptions-item>
          <el-descriptions-item label="Updated">{{
            new Date(application.updatedAt).toLocaleString()
          }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never" class="configuration-card">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="Owners" name="owners">
            <div class="tab-toolbar">
              <span>Application members</span
              ><el-tooltip
                :disabled="application.capabilities.manageOwners"
                content="Application admin role and BiszPortal.ApplicationOwners.manage are required"
                ><span
                  ><el-button
                    type="primary"
                    :icon="Plus"
                    :disabled="!application.capabilities.manageOwners"
                    @click="ownerDialog = true"
                    >Add user</el-button
                  ></span
                ></el-tooltip
              >
            </div>
            <el-table :data="application.owners">
              <el-table-column label="User" min-width="230"
                ><template #default="{ row }"
                  ><div class="identity">
                    <el-avatar :src="row.image || undefined">{{
                      row.displayName.slice(0, 2).toUpperCase()
                    }}</el-avatar
                    ><span>{{ row.displayName }}</span>
                  </div></template
                ></el-table-column
              >
              <el-table-column prop="userId" label="User ID" min-width="330"
                ><template #default="{ row }">
                  <pre>{{ row.userId }}</pre>
                </template></el-table-column
              >
              <el-table-column label="Role" width="180"
                ><template #default="{ row }"
                  ><el-select
                    :model-value="row.role"
                    :disabled="!application.capabilities.manageOwners"
                    @change="changeOwnerRole(row, $event)"
                    ><el-option label="Admin" value="role.ADMIN" /><el-option
                      label="General"
                      value="role.GENERAL" /></el-select></template
              ></el-table-column>
              <el-table-column label="" width="70"
                ><template #default="{ row }"
                  ><el-button
                    v-if="application.capabilities.manageOwners"
                    text
                    type="danger"
                    :icon="Delete"
                    aria-label="Remove member"
                    @click="removeOwner(row)" /></template
              ></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="Resources" name="resources">
            <div class="tab-toolbar">
              <span>Claimed resource servers</span
              ><el-tooltip
                :disabled="application.capabilities.manageResources"
                content="BiszPortal.ApplicationResources.manage and application membership are required"
                ><span
                  ><el-button
                    :disabled="!application.capabilities.manageResources"
                    @click="openResource('attach')"
                    >Attach existing</el-button
                  ><el-button
                    type="primary"
                    :icon="Plus"
                    :disabled="!application.capabilities.manageResources"
                    @click="openResource('create')"
                    >Create resource</el-button
                  ></span
                ></el-tooltip
              >
            </div>
            <el-table :data="application.resources">
              <el-table-column prop="name" label="Resource" min-width="200" />
              <el-table-column
                prop="resourceId"
                label="Resource ID"
                min-width="330"
                ><template #default="{ row }">
                  <pre>{{ row.resourceId }}</pre>
                </template></el-table-column
              >
              <el-table-column label="Usage" width="110"
                ><template #default="{ row }"
                  ><el-tag :type="row.claimCount > 1 ? 'warning' : 'info'"
                    >{{ row.claimCount }} client{{
                      row.claimCount === 1 ? "" : "s"
                    }}</el-tag
                  ></template
                ></el-table-column
              >
              <el-table-column label="Operations" width="230"
                ><template #default="{ row }"
                  ><el-button
                    :disabled="
                      !application.capabilities.manageResources ||
                      row.claimCount > 1
                    "
                    text
                    :icon="EditPen"
                    @click="openResource('edit', row)"
                    >Edit</el-button
                  ><el-dropdown
                    v-if="application.capabilities.manageResources"
                    @command="
                      (command) => removeResource(row, command === 'delete')
                    "
                    ><el-button text type="danger">Remove</el-button
                    ><template #dropdown
                      ><el-dropdown-menu
                        ><el-dropdown-item command="detach"
                          >Detach</el-dropdown-item
                        ><el-dropdown-item
                          command="delete"
                          :disabled="row.claimCount > 1"
                          >Delete definition</el-dropdown-item
                        ></el-dropdown-menu
                      ></template
                    ></el-dropdown
                  ></template
                ></el-table-column
              >
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="Scopes" name="scopes">
            <div class="tab-toolbar">
              <span>Allowed scopes by resource</span
              ><el-tooltip
                :disabled="application.capabilities.manageScopes"
                content="BiszPortal.ApplicationScopes.manage and application membership are required"
                ><span
                  ><el-button
                    type="primary"
                    :disabled="!application.capabilities.manageScopes"
                    :loading="saving"
                    @click="saveScopes"
                    >Save scopes</el-button
                  ></span
                ></el-tooltip
              >
            </div>
            <el-tree
              ref="scopeTree"
              :data="treeData"
              node-key="id"
              show-checkbox
              :default-checked-keys="checkedScopeKeys"
              :props="{
                label: 'label',
                children: 'children',
                disabled: () => !application?.capabilities.manageScopes,
              }"
            />
          </el-tab-pane>

          <el-tab-pane label="Permissions" name="permissions">
            <div class="tab-toolbar">
              <span>Permission definitions</span
              ><el-button
                type="primary"
                :icon="Plus"
                :disabled="!application.capabilities.managePermissions"
                @click="createPermission"
                >Add permission</el-button
              >
            </div>
            <el-table
              :data="application.permissions"
              empty-text="No permission definitions"
            >
              <el-table-column
                prop="permission"
                label="Permission"
                min-width="300"
                ><template #default="{ row }">
                  <pre>{{ row.permission }}</pre>
                </template></el-table-column
              >
              <el-table-column
                prop="description"
                label="Description"
                min-width="320"
              />
              <el-table-column label="" width="150"
                ><template #default="{ row }"
                  ><div class="row-actions">
                    <el-button
                      text
                      :icon="EditPen"
                      :disabled="!application.capabilities.managePermissions"
                      @click="editPermission(row)"
                      >Edit</el-button
                    ><el-button
                      text
                      type="danger"
                      :icon="Delete"
                      :disabled="!application.capabilities.managePermissions"
                      @click="deletePermission(row)" />
                  </div></template
              ></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="Redirect URIs" name="redirects">
            <div class="tab-toolbar">
              <span>Registered callback destinations</span
              ><el-tooltip
                :disabled="application.capabilities.manageRedirectUris"
                content="BiszPortal.ApplicationRedirectUris.manage and application membership are required"
                ><span
                  ><el-button
                    type="primary"
                    :icon="Plus"
                    :disabled="!application.capabilities.manageRedirectUris"
                    @click="editRedirect(null)"
                    >Add redirect URI</el-button
                  ></span
                ></el-tooltip
              >
            </div>
            <el-table :data="application.redirectUris.map((uri) => ({ uri }))">
              <el-table-column prop="uri" label="Redirect URI" min-width="500"
                ><template #default="{ row }">
                  <pre>{{ row.uri }}</pre>
                </template></el-table-column
              >
              <el-table-column label="" width="150"
                ><template #default="{ $index }"
                  ><div class="row-actions">
                    <el-button
                      text
                      :icon="EditPen"
                      :disabled="!application.capabilities.manageRedirectUris"
                      @click="editRedirect($index)"
                      >Edit</el-button
                    ><el-button
                      text
                      type="danger"
                      :icon="Delete"
                      :disabled="
                        !application.capabilities.manageRedirectUris ||
                        application.redirectUris.length === 1
                      "
                      @click="deleteRedirect($index)" />
                  </div></template
              ></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="Authorization URL Generator" name="generator">
            <el-form label-position="top" class="generator-form">
              <el-form-item label="Redirect URI"
                ><el-select v-model="generator.redirectUri" filterable
                  ><el-option
                    v-for="uri in application.redirectUris"
                    :key="uri"
                    :label="uri"
                    :value="uri" /></el-select
              ></el-form-item>
              <el-form-item label="Resource"
                ><el-select
                  v-model="generator.resourceId"
                  filterable
                  placeholder="Select one resource"
                  ><el-option
                    v-for="resource in application.resources"
                    :key="resource.resourceId"
                    :label="`${resource.name} — ${resource.resourceId}`"
                    :value="resource.resourceId" /></el-select
              ></el-form-item>
              <el-form-item label="Scopes"
                ><el-checkbox-group v-model="generator.scopes"
                  ><el-checkbox value="profile">profile</el-checkbox
                  ><el-checkbox value="email">email</el-checkbox
                  ><el-checkbox value="offline_access"
                    >offline_access</el-checkbox
                  ><el-checkbox
                    v-for="scope in generatorScopeOptions"
                    :key="scope"
                    :value="scope"
                    >{{ scope }}</el-checkbox
                  ></el-checkbox-group
                ></el-form-item
              >
              <el-form-item
                ><el-checkbox v-model="generator.integration"
                  >Include integration-ready parameters</el-checkbox
                ></el-form-item
              >
              <el-alert
                v-if="!generator.integration"
                title="The URL contains placeholders for state, nonce, and PKCE. Replace them in your integration before use."
                type="info"
                :closable="false"
              />
              <template v-else
                ><el-alert
                  title="Persist the verifier, state, and nonce before opening the URL so the callback can validate and exchange the code."
                  type="warning"
                  :closable="false"
                /><el-descriptions class="parameter-bundle" :column="1" border
                  ><el-descriptions-item label="State">
                    <pre>{{ generatorState }}</pre></el-descriptions-item
                  ><el-descriptions-item label="Nonce">
                    <pre>{{ generatorNonce }}</pre></el-descriptions-item
                  ><el-descriptions-item label="PKCE verifier">
                    <pre>{{ generatorVerifier }}</pre>
                  </el-descriptions-item></el-descriptions
                ></template
              >
              <el-form-item label="Authorization URL"
                ><el-input
                  v-model="generatorUrl"
                  type="textarea"
                  :rows="6"
                  readonly
              /></el-form-item>
              <div class="generator-actions">
                <el-button :icon="Refresh" @click="refreshGenerator"
                  >Regenerate</el-button
                ><el-button :icon="CopyDocument" @click="copy(generatorUrl)"
                  >Copy URL</el-button
                ><el-button
                  v-if="generator.integration"
                  type="primary"
                  :icon="Link"
                  :disabled="!generator.redirectUri || !generator.resourceId"
                  @click="
                    navigateTo(generatorUrl, {
                      external: true,
                      open: { target: '_blank' },
                    })
                  "
                  >Open URL</el-button
                >
              </div>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <el-dialog
      v-model="ownerDialog"
      title="Add application member"
      width="min(520px, 94vw)"
      ><el-form label-position="top"
        ><el-form-item label="Exact Basis user ID"
          ><el-input v-model="ownerForm.userId" /></el-form-item
        ><el-form-item label="Role"
          ><el-select v-model="ownerForm.role"
            ><el-option label="Admin" value="role.ADMIN" /><el-option
              label="General"
              value="role.GENERAL" /></el-select></el-form-item></el-form
      ><template #footer
        ><el-button @click="ownerDialog = false">Cancel</el-button
        ><el-button type="primary" :loading="saving" @click="addOwner"
          >Add user</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="resourceDialog"
      :title="
        resourceMode === 'attach'
          ? 'Attach resource'
          : resourceMode === 'create'
            ? 'Create resource'
            : 'Edit resource'
      "
      width="min(580px, 94vw)"
      ><el-form label-position="top"
        ><el-form-item label="Resource"
          ><el-select
            v-if="resourceMode === 'attach'"
            v-model="resourceForm.resourceId"
            filterable
            ><el-option
              v-for="resource in application?.availableResources.filter(
                (candidate) =>
                  !application?.resources.some(
                    (claim) => claim.resourceId === candidate.resourceId,
                  ),
              )"
              :key="resource.resourceId"
              :label="`${resource.name} — ${resource.resourceId}`"
              :value="resource.resourceId" /></el-select
          ><el-input
            v-else
            v-model="resourceForm.resourceId"
            :disabled="resourceMode === 'edit'" /></el-form-item
        ><template v-if="resourceMode !== 'attach'"
          ><el-form-item label="Display name"
            ><el-input v-model="resourceForm.name" /></el-form-item
          ><el-form-item label="Available scopes"
            ><el-input
              v-model="resourceForm.scopesText"
              type="textarea"
              :rows="4"
              placeholder="Comma-separated scopes" /></el-form-item></template></el-form
      ><template #footer
        ><el-button @click="resourceDialog = false">Cancel</el-button
        ><el-button type="primary" :loading="saving" @click="saveResource"
          >Save</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="settingsDialog"
      title="Application settings"
      width="min(620px, 94vw)"
      ><el-form label-position="top"
        ><el-form-item label="Name"
          ><el-input v-model="settingsForm.name" /></el-form-item
        ><el-form-item label="Organizations"
          ><el-checkbox-group v-model="settingsForm.organizationIds"
            ><el-checkbox
              v-for="organization in application?.availableOrganizations"
              :key="organization.organizationId"
              :value="organization.organizationId"
              >{{ organization.organizationId
              }}{{
                organization.firstParty ? " (first party)" : ""
              }}</el-checkbox
            ></el-checkbox-group
          ></el-form-item
        ><el-form-item label="Account filter"
          ><el-select
            v-model="settingsForm.filterMode"
            clearable
            placeholder="No filter"
            ><el-option
              label="Allow only listed accounts"
              value="whitelist" /><el-option
              label="Block listed accounts"
              value="blacklist" /></el-select></el-form-item
        ><el-form-item
          v-if="settingsForm.filterMode"
          label="Account identifiers"
          ><el-input
            v-model="settingsForm.filterContentText"
            type="textarea"
            :rows="3"
            placeholder="Comma-separated email addresses" /></el-form-item
        ><el-form-item
          ><el-checkbox v-model="settingsForm.requireConsent"
            >Require user consent</el-checkbox
          ></el-form-item
        ></el-form
      ><template #footer
        ><el-button
          v-if="application?.capabilities.delete"
          type="danger"
          plain
          @click="deleteApplication"
          >Delete application</el-button
        ><el-button @click="settingsDialog = false">Cancel</el-button
        ><el-button type="primary" :loading="saving" @click="saveSettings"
          >Save</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="secretDialog"
      title="Copy the client secret now"
      width="min(620px, 94vw)"
      :close-on-click-modal="false"
      :show-close="false"
      ><el-alert
        title="This secret is shown only once. It cannot be recovered after this dialog closes."
        type="warning"
        :closable="false"
        show-icon
      /><el-input
        class="secret-value"
        :model-value="clientSecret"
        readonly
        type="textarea"
        :rows="3"
      /><template #footer
        ><el-button @click="copy(clientSecret)">Copy secret</el-button
        ><el-button
          type="primary"
          @click="
            secretDialog = false;
            clientSecret = '';
          "
          >I have copied it</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="permissionDialog"
      :title="
        permissionMode === 'create'
          ? 'Add permission definition'
          : 'Edit permission description'
      "
      width="min(580px, 94vw)"
      ><el-form label-position="top"
        ><el-form-item label="Permission"
          ><el-input
            v-model="permissionForm.permission"
            :disabled="permissionMode === 'edit'" /></el-form-item
        ><el-form-item label="Description"
          ><el-input
            v-model="permissionForm.description"
            type="textarea"
            :rows="4" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="permissionDialog = false">Cancel</el-button
        ><el-button type="primary" :loading="saving" @click="savePermission"
          >Save</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="redirectDialog"
      :title="redirectIndex === null ? 'Add redirect URI' : 'Edit redirect URI'"
      width="min(640px, 94vw)"
      ><el-form label-position="top"
        ><el-form-item label="Absolute redirect URI"
          ><el-input v-model="redirectValue" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="redirectDialog = false">Cancel</el-button
        ><el-button type="primary" :loading="saving" @click="saveRedirect"
          >Save</el-button
        ></template
      ></el-dialog
    >
  </section>
</template>

<style scoped>
.application-header,
.tab-toolbar,
.identity,
.generator-actions,
.header-actions {
  display: flex;
  align-items: center;
}
.application-header,
.tab-toolbar {
  justify-content: space-between;
  gap: 16px;
}
.application-header {
  align-items: flex-start;
}
.application-header h1 {
  margin-top: 8px;
}
.client-id,
pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: 12px/1.5 var(--el-font-family);
}
.details-card {
  margin-bottom: 18px;
}
.configuration-card :deep(.el-card__body) {
  padding-top: 4px;
}
.tab-toolbar {
  min-height: 52px;
}
.identity {
  gap: 10px;
}
.generator-form {
  max-width: 900px;
  padding: 14px 4px;
}
.generator-form .el-select {
  width: 100%;
}
.parameter-bundle {
  margin: 14px 0;
}
.secret-value {
  margin-top: 16px;
  font-family: monospace;
}
.generator-actions {
  justify-content: flex-end;
  gap: 8px;
}
.header-actions {
  gap: 8px;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
@media (max-width: 700px) {
  .application-header,
  .tab-toolbar,
  .generator-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .details-card :deep(.el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
