import { z } from "zod";
import {
  AssetsVFS,
  AssetsVFSError,
  AssetsVFSDirectoryCreationError,
  ManifestFormatError,
  createAssetsVFSDirectory,
} from "@basis/assets-vfs";
import { assetsApiUrl } from "~/server/utils/assets-auth";

const assetsProjectSchema = z.object({
  uid: z.string().min(1),
  name: z.string(),
  description: z.string(),
});

const assetsProjectListSchema = z.object({
  projects: z.array(assetsProjectSchema),
});

export type AssetsProject = z.infer<typeof assetsProjectSchema>;

export class AssetsProjectRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AssetsProjectRequestError";
  }
}

async function errorDescription(response: Response) {
  const payload = await response.json().catch(() => null) as
    | { error_description?: unknown; message?: unknown }
    | null;
  if (typeof payload?.error_description === "string")
    return payload.error_description;
  if (typeof payload?.message === "string") return payload.message;
  return `Assets API returned ${response.status}`;
}

export async function createAssetsProject(
  accessToken: string,
  input: { name: string; description: string },
  baseUrl = assetsApiUrl(),
): Promise<AssetsProject> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/project`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new AssetsProjectRequestError(
      "The Assets service could not be reached",
      502,
    );
  }

  if (!response.ok) {
    throw new AssetsProjectRequestError(
      await errorDescription(response),
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }

  const parsed = assetsProjectSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) {
    throw new AssetsProjectRequestError(
      "The Assets service returned an invalid project",
      502,
    );
  }
  return parsed.data;
}

export async function assetsProjectExists(uid: string, baseUrl = assetsApiUrl()) {
  try {
    const response = await fetch(`${baseUrl}/project`, {
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const parsed = assetsProjectListSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return parsed.data.projects.some((project) => project.uid === uid);
  } catch {
    return null;
  }
}

export async function createAssetsRootDirectory(
  accessToken: string,
  projectUid: string,
  baseUrl = assetsApiUrl(),
  fetchImplementation = globalThis.fetch,
) {
  try {
    return await createAssetsVFSDirectory(projectUid, {
      endpoint: baseUrl,
      token: accessToken,
      fetch: fetchImplementation,
    });
  } catch (error) {
    if (error instanceof AssetsVFSDirectoryCreationError) {
      const status = error.status;
      throw new AssetsProjectRequestError(
        error.message,
        status && status >= 400 && status < 500 ? status : 502,
      );
    }
    throw new AssetsProjectRequestError(
      "The Assets VFS root directory could not be created",
      502,
    );
  }
}

export async function assetsManifestExists(
  projectUid: string,
  manifestObjectId: string,
  baseUrl = assetsApiUrl(),
  fetchImplementation = globalThis.fetch,
) {
  try {
    const vfs = await AssetsVFS.mount({
      endpoint: baseUrl,
      manifestId: manifestObjectId,
      fetch: fetchImplementation,
    });
    return vfs.manifest?.header.projectId === projectUid;
  } catch (error) {
    if (
      error instanceof ManifestFormatError ||
      (error instanceof AssetsVFSError &&
        (error.status === 404 || error.code === "EXDEV"))
    ) {
      return false;
    }
    return null;
  }
}

export async function deleteAssetsProject(
  accessToken: string,
  uid: string,
  baseUrl = assetsApiUrl(),
) {
  try {
    const response = await fetch(
      `${baseUrl}/project/${encodeURIComponent(uid)}`,
      {
        method: "DELETE",
        redirect: "error",
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (response.ok || response.status === 404) return true;
  } catch {
    // The caller logs enough context to reconcile the orphaned project.
  }
  return false;
}

export async function cleanupAssetsProject(
  accessToken: string,
  uid: string,
  reason: string,
) {
  if (await deleteAssetsProject(accessToken, uid)) return;
  console.error("Failed to clean up allocated Assets project", { uid, reason });
}
