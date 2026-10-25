import { createPrivateKey, type KeyObject } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { SignJWT } from "jose";
import { APIError } from "~/server/utils/basis-schema";
import { githubApiFetch } from "~/server/utils/github-fetch";

type GitHubInstallation = { id: number };
type GitHubInstallationToken = { token: string; expires_at: string };

const installationIds = new Map<string, number>();
const installationTokens = new Map<
  number,
  { token: string; expiresAt: number }
>();
const installationTokenRequests = new Map<
  number,
  Promise<string | APIError>
>();

let cachedPrivateKey: { path: string; key: KeyObject } | undefined;

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "bisz-portal",
  "X-GitHub-Api-Version": "2026-03-10",
};

function responseStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  if ("statusCode" in error && typeof error.statusCode === "number")
    return error.statusCode;
  if ("status" in error && typeof error.status === "number")
    return error.status;
  if (
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return error.response.status;
  }
  return undefined;
}

function githubAppError(
  error: unknown,
  operation: "installation" | "token",
) {
  console.log(error)
  const status = responseStatus(error);
  if (status === 404 && operation === "installation") {
    return new APIError(
      "github_app_not_installed",
      "The GitHub App is not installed for this repository. See how to install here: https://bisz.dev/GitHubAppInstall",
      422,
      "github_app_not_installed",
    );
  }
  if (status === 401 || status === 403) {
    return new APIError(
      "github_app_authentication_failed",
      "GitHub rejected the configured App credentials or permissions",
      502,
      "github_app_authentication_failed",
    );
  }
  return new APIError(
    "github_app_unavailable",
    "GitHub App authentication could not be completed",
    502,
    "github_app_unavailable",
  );
}

async function githubAppJwt(): Promise<string | APIError> {
  const config = useRuntimeConfig();
  const appId = String(config.githubAppId || "").trim();
  const configuredPath = String(config.githubAppPrivateKeyPath || "").trim();
  if (!appId || !configuredPath) {
    return new APIError(
      "github_app_not_configured",
      "GitHub App credentials are not configured",
      503,
      "github_app_not_configured",
    );
  }

  try {
    const privateKeyPath = isAbsolute(configuredPath)
      ? configuredPath
      : resolve(process.cwd(), configuredPath);
    if (!cachedPrivateKey || cachedPrivateKey.path !== privateKeyPath) {
      const pem = await readFile(privateKeyPath, "utf8");
      cachedPrivateKey = {
        path: privateKeyPath,
        key: createPrivateKey(pem),
      };
    }

    const now = Math.floor(Date.now() / 1000);
    return await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 9 * 60)
      .setIssuer(appId)
      .sign(cachedPrivateKey.key);
  } catch {
    return new APIError(
      "github_app_credentials_unavailable",
      "The configured GitHub App private key could not be loaded",
      503,
      "github_app_credentials_unavailable",
    );
  }
}

async function repositoryInstallationId(
  owner: string,
  repository: string,
  jwt: string,
): Promise<number | APIError> {
  const cacheKey = `${owner.toLowerCase()}/${repository.toLowerCase()}`;
  const cached = installationIds.get(cacheKey);
  if (cached) return cached;

  try {
    const installation = await githubApiFetch<GitHubInstallation>(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/installation`,
      {
        headers: {
          ...githubHeaders,
          Authorization: `Bearer ${jwt}`,
        },
      },
    );
    installationIds.set(cacheKey, installation.id);
    return installation.id;
  } catch (error) {
    return githubAppError(error, "installation");
  }
}

async function createInstallationToken(
  installationId: number,
  jwt: string,
): Promise<string | APIError> {
  try {
    const result = await githubApiFetch<GitHubInstallationToken>(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          ...githubHeaders,
          Authorization: `Bearer ${jwt}`,
        },
        body: {
          permissions: { contents: "read", metadata: "read" },
        },
      },
    );
    installationTokens.set(installationId, {
      token: result.token,
      expiresAt: Date.parse(result.expires_at),
    });
    return result.token;
  } catch (error) {
    return githubAppError(error, "token");
  }
}

async function installationToken(
  installationId: number,
  jwt: string,
): Promise<string | APIError> {
  const cached = installationTokens.get(installationId);
  if (cached && cached.expiresAt - 5 * 60_000 > Date.now()) {
    return cached.token;
  }

  const inFlight = installationTokenRequests.get(installationId);
  if (inFlight) return await inFlight;

  const request = createInstallationToken(installationId, jwt).finally(() => {
    installationTokenRequests.delete(installationId);
  });
  installationTokenRequests.set(installationId, request);
  return await request;
}

export async function githubRepositoryAuthorization(
  owner: string,
  repository: string,
): Promise<string | APIError> {
  const jwt = await githubAppJwt();
  if (jwt instanceof APIError) return jwt;

  const installationId = await repositoryInstallationId(
    owner,
    repository,
    jwt,
  );
  if (installationId instanceof APIError) return installationId;

  const token = await installationToken(installationId, jwt);
  if (token instanceof APIError) return token;
  return `Bearer ${token}`;
}
