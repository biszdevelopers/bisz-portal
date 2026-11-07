export type AssetVersion = {
  version: string;
  sha256: string;
  originalFileName?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type AssetItem = AssetVersion & {
  id: string;
  projectUid: string;
};

export type AssetProject = {
  uid: string;
  name: string;
  description: string;
};

export type AssetList = {
  items: AssetItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AssetVersionList = {
  id: string;
  items: AssetVersion[];
};

export type AssetsConnection = {
  portalSignedIn: boolean;
  connected: boolean;
  userId: string | null;
};

export type UploadSession = {
  sessionToken: string;
  projectUid: string;
};

type AssetsFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: FormData | Record<string, unknown>;
  sessionToken?: string;
  authenticated?: boolean;
  retry?: boolean;
};

export function useAssetsApi() {
  const config = useRuntimeConfig();
  const assetBase = computed(() =>
    config.public.assetsApiUrl.replace(/\/$/, ""),
  );
  const connection = useState<AssetsConnection>("assets-connection", () => ({
    portalSignedIn: false,
    connected: false,
    userId: null,
  }));
  const connectionChecked = useState("assets-connection-checked", () => false);
  const connectionPending = useState("assets-connection-pending", () => false);
  const connectionError = useState<unknown>("assets-connection-error", () => null);
  const projects = useState<AssetProject[]>("assets-projects", () => []);
  const projectsPending = useState("assets-projects-pending", () => false);
  const projectsError = useState<unknown>("assets-projects-error", () => null);
  const projectsChecked = useState("assets-projects-checked", () => false);

  async function ensureConnection(force = false) {
    if (!force && connectionChecked.value) return connection.value;
    connectionPending.value = true;
    try {
      connection.value = await $fetch<AssetsConnection>("/api/assets/connection");
      if (connection.value.connected) {
        await acquireToken();
      } else if (connection.value.userId) {
        clearAssetsBrowserToken(connection.value.userId);
      } else {
        clearAllAssetsBrowserTokens();
      }
      connectionError.value = null;
    } catch (caught) {
      connectionError.value = caught;
      if (connection.value.userId)
        clearAssetsBrowserToken(connection.value.userId);
      connection.value = { ...connection.value, connected: false };
    } finally {
      connectionChecked.value = true;
      connectionPending.value = false;
    }
    return connection.value;
  }

  async function acquireToken(force = false): Promise<string | null> {
    const userId = connection.value.userId;
    if (!connection.value.connected || !userId) return null;
    if (!force) {
      const saved = readAssetsBrowserToken(userId);
      if (saved) return saved;
    }
    const result = await $fetch<{ accessToken: string; userId: string }>(
      force ? "/api/assets/token?force=1" : "/api/assets/token",
      { method: "POST" },
    );
    if (result.userId !== userId)
      throw new Error("The portal account changed. Reconnect Assets.");
    saveAssetsBrowserToken(userId, result.accessToken);
    return result.accessToken;
  }

  async function assetsFetch<T>(
    path: string,
    options: AssetsFetchOptions = {},
  ): Promise<T> {
    const authenticated =
      options.authenticated ?? connection.value.connected;
    const token = authenticated ? await acquireToken() : null;
    if (authenticated && !token)
      throw new Error("Connect to DevConnect Assets first.");
    const isForm = options.body instanceof FormData;
    const response = await fetch(`${assetBase.value}${path}`, {
      method: options.method ?? "GET",
      credentials: "omit",
      redirect: "error",
      cache: authenticated ? "no-store" : "default",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.sessionToken
          ? { "X-Upload-Session-Token": options.sessionToken }
          : {}),
        ...(options.body && !isForm
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        options.body == null
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
    });
    if (response.status === 401 && authenticated && options.retry !== false) {
      if (connection.value.userId)
        clearAssetsBrowserToken(connection.value.userId);
      try {
        await acquireToken(true);
      } catch (caught) {
        connection.value.connected = false;
        throw caught;
      }
      return assetsFetch<T>(path, { ...options, retry: false });
    }
    if (response.status === 401 && authenticated) {
      if (connection.value.userId)
        clearAssetsBrowserToken(connection.value.userId);
      connection.value.connected = false;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        payload.error_description ||
          payload.message ||
          `Assets API returned ${response.status}`,
      );
    }
    return response.status === 204
      ? ({} as T)
      : ((await response.json()) as T);
  }

  async function uploadFormData<T>(
    path: string,
    body: FormData,
    sessionToken: string,
    onProgress?: (progress: number) => void,
    retry = true,
  ): Promise<T> {
    const token = await acquireToken();
    if (!token) throw new Error("Connect to DevConnect Assets first.");

    const response = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `${assetBase.value}${path}`);
        request.setRequestHeader("Authorization", `Bearer ${token}`);
        request.setRequestHeader("X-Upload-Session-Token", sessionToken);
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress?.(
              Math.min(100, Math.round((event.loaded / event.total) * 100)),
            );
          }
        });
        request.addEventListener("load", () =>
          resolve({ status: request.status, body: request.responseText }),
        );
        request.addEventListener("error", () =>
          reject(new Error("The upload could not reach the Assets API.")),
        );
        request.addEventListener("abort", () =>
          reject(new Error("The upload was cancelled.")),
        );
        request.send(body);
      },
    );

    if (response.status === 401 && retry) {
      if (connection.value.userId)
        clearAssetsBrowserToken(connection.value.userId);
      try {
        await acquireToken(true);
      } catch (caught) {
        connection.value.connected = false;
        throw caught;
      }
      onProgress?.(0);
      return uploadFormData<T>(path, body, sessionToken, onProgress, false);
    }
    if (response.status === 401) {
      if (connection.value.userId)
        clearAssetsBrowserToken(connection.value.userId);
      connection.value.connected = false;
    }
    if (response.status < 200 || response.status >= 300) {
      let payload: { error_description?: string; message?: string } = {};
      try {
        payload = JSON.parse(response.body || "{}");
      } catch {
        /* Use the status fallback when the API did not return JSON. */
      }
      throw new Error(
        payload.error_description ||
          payload.message ||
          `Assets API returned ${response.status}`,
      );
    }
    return response.status === 204 || !response.body
      ? ({} as T)
      : (JSON.parse(response.body) as T);
  }

  async function refreshProjects(force = false) {
    if (!force && projectsChecked.value) return;
    projectsPending.value = true;
    try {
      const data = await assetsFetch<{ projects: AssetProject[] }>("/project");
      projects.value = data.projects;
      projectsError.value = null;
    } catch (caught) {
      projectsError.value = caught;
    } finally {
      projectsChecked.value = true;
      projectsPending.value = false;
    }
  }

  async function disconnectAssetsConnection() {
    await $fetch("/api/assets/connection", { method: "DELETE" });
    if (connection.value.userId)
      clearAssetsBrowserToken(connection.value.userId);
    else clearAllAssetsBrowserTokens();
    connection.value = { ...connection.value, connected: false };
    connectionChecked.value = true;
  }

  function connectAssets() {
    navigateTo(
      connection.value.portalSignedIn
        ? "/api/auth/callback/assets"
        : "/api/auth/callback/basis-auth",
      { external: true },
    );
  }

  return {
    assetBase,
    connection,
    connectionChecked,
    connectionPending,
    connectionError,
    projects,
    projectsPending,
    projectsError,
    ensureConnection,
    acquireToken,
    assetsFetch,
    uploadFormData,
    refreshProjects,
    disconnectAssetsConnection,
    connectAssets,
  };
}
