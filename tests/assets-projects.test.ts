import { afterEach, describe, expect, mock, test } from "bun:test";
import { encodeManifest } from "@basis/assets-vfs";
import {
  AssetsProjectRequestError,
  assetsManifestExists,
  assetsProjectExists,
  createAssetsProject,
  createAssetsRootDirectory,
  deleteAssetsProject,
} from "../server/utils/assets-projects";

const originalFetch = globalThis.fetch;

function setFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = mock(handler);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Assets project API", () => {
  test("creates a project on behalf of the bearer token", async () => {
    const fetchMock = setFetch(async () =>
      Response.json({ uid: "assets-123", name: "Portal", description: "Files" }),
    );

    await expect(
      createAssetsProject(
        "user-token",
        { name: "Portal", description: "Files" },
        "https://assets.example",
      ),
    ).resolves.toEqual({
      uid: "assets-123",
      name: "Portal",
      description: "Files",
    });

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://assets.example/project");
    expect(options).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Portal", description: "Files" }),
    });
  });

  test("rejects malformed successful responses", async () => {
    setFetch(async () => Response.json({ name: "No UID" }));
    await expect(
      createAssetsProject(
        "user-token",
        { name: "Portal", description: "" },
        "https://assets.example",
      ),
    ).rejects.toBeInstanceOf(AssetsProjectRequestError);
  });

  test("creates a VFS root manifest inside the allocated Assets project", async () => {
    setFetch(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        expect(await new Request(input, init).json()).toEqual({
          projectUid: "project-123",
        });
        return Response.json({ sessionToken: "upload-token" });
      }
      const form = init?.body as FormData;
      const manifest = JSON.parse(String(form.get("manifest"))) as {
        files: Array<{ objectId: string }>;
      };
      expect(new Headers(init?.headers).get("X-Upload-Session-Token")).toBe(
        "upload-token",
      );
      return Response.json({ items: [{ id: manifest.files[0]!.objectId }] });
    });

    await expect(
      createAssetsRootDirectory(
        "user-token",
        "project-123",
        "https://assets.example",
        globalThis.fetch,
      ),
    ).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  test("distinguishes linked, missing, and unavailable projects", async () => {
    setFetch(async () =>
      Response.json({
        projects: [{ uid: "linked", name: "Project", description: "" }],
      }),
    );
    await expect(
      assetsProjectExists("linked", "https://assets.example"),
    ).resolves.toBe(true);
    await expect(
      assetsProjectExists("missing", "https://assets.example"),
    ).resolves.toBe(false);

    setFetch(async () => new Response(null, { status: 503 }));
    await expect(
      assetsProjectExists("linked", "https://assets.example"),
    ).resolves.toBeNull();
  });

  test("verifies that the root manifest belongs to the linked project", async () => {
    const manifest = encodeManifest({
      header: { projectId: "project-123", directoryId: crypto.randomUUID() },
      directories: [],
      files: [],
    });
    const manifestBody = new Uint8Array(manifest.byteLength);
    manifestBody.set(manifest);
    setFetch(async () => new Response(manifestBody.buffer));
    await expect(
      assetsManifestExists(
        "project-123",
        "manifest-id",
        "https://assets.example",
        globalThis.fetch,
      ),
    ).resolves.toBe(true);
    await expect(
      assetsManifestExists(
        "other-project",
        "manifest-id",
        "https://assets.example",
        globalThis.fetch,
      ),
    ).resolves.toBe(false);

    setFetch(async () => new Response(null, { status: 503 }));
    await expect(
      assetsManifestExists(
        "project-123",
        "manifest-id",
        "https://assets.example",
        globalThis.fetch,
      ),
    ).resolves.toBeNull();
  });

  test("treats successful deletion and an already missing project as cleanup", async () => {
    setFetch(async () => new Response(null, { status: 204 }));
    await expect(
      deleteAssetsProject("user-token", "uid/with slash", "https://assets.example"),
    ).resolves.toBe(true);

    setFetch(async () => new Response(null, { status: 404 }));
    await expect(
      deleteAssetsProject("user-token", "missing", "https://assets.example"),
    ).resolves.toBe(true);
  });
});
