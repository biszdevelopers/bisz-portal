import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  AssetsProjectRequestError,
  assetsProjectExists,
  createAssetsProject,
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
