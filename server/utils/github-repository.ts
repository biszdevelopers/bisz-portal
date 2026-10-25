import { APIError } from "~/server/utils/basis-schema";
import { githubRepositoryAuthorization } from "~/server/utils/github-app";
import { githubApiFetch } from "~/server/utils/github-fetch";
import type { RepositoryValidationResult } from "~/shared/contracts";

export type ParsedGitHubRepositoryUrl = {
  owner: string;
  repository: string;
  canonicalUrl: string;
};

const ownerPattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const repositoryPattern = /^[a-z\d._-]{1,100}$/i;

type GitHubRepository = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  archived: boolean;
  owner: { login: string; avatar_url: string };
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string;
  pushed_at: string | null;
};

type GitHubReadme = {
  content: string;
  encoding: string;
  download_url: string | null;
  html_url: string;
};

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "bisz-portal",
  "X-GitHub-Api-Version": "2026-03-10",
};

export function parseGitHubRepositoryUrl(
  value: string,
): ParsedGitHubRepositoryUrl | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  const segments = path.split("/");
  if (segments.length !== 2) return null;

  const [owner, repositoryWithSuffix] = segments;
  const repository = repositoryWithSuffix?.replace(/\.git$/i, "");
  if (
    !owner ||
    !repository ||
    !ownerPattern.test(owner) ||
    !repositoryPattern.test(repository)
  ) {
    return null;
  }

  return {
    owner,
    repository,
    canonicalUrl: `https://github.com/${owner}/${repository}`,
  };
}

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

function githubError(error: unknown, resource: "repository" | "readme") {
  const status = responseStatus(error);
  if (status === 404) {
    return resource === "repository"
      ? new APIError(
          "repository_not_found",
          "The repository was not found or is not publicly accessible",
          404,
          "repository_not_found",
        )
      : new APIError(
          "repository_readme_missing",
          "The repository does not contain a README",
          422,
          "repository_readme_missing",
        );
  }
  if (status === 403 || status === 429) {
    return new APIError(
      "github_rate_limited",
      "GitHub temporarily refused the repository check; try again later",
      429,
      "github_rate_limited",
    );
  }
  return new APIError(
    "github_unavailable",
    "GitHub could not complete the repository check",
    502,
    "github_unavailable",
  );
}

export async function fetchGitHubRepository(
  repositoryUrl: string,
): Promise<Omit<RepositoryValidationResult, "status" | "code"> | APIError> {
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  if (!parsed) {
    return new APIError(
      "invalid_repository_url",
      "Enter an HTTPS GitHub repository URL such as https://github.com/owner/repository",
      400,
      "invalid_repository_url",
    );
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`;
  const authorization = await githubRepositoryAuthorization(
    parsed.owner,
    parsed.repository,
  );
  if (authorization instanceof APIError) return authorization;
  const authenticatedHeaders = {
    ...githubHeaders,
    Authorization: authorization,
  };

  let repository: GitHubRepository;
  try {
    repository = await githubApiFetch<GitHubRepository>(apiUrl, {
      headers: authenticatedHeaders,
    });
  } catch (error) {
    return githubError(error, "repository");
  }

  let readme: GitHubReadme;
  try {
    readme = await githubApiFetch<GitHubReadme>(`${apiUrl}/readme`, {
      headers: authenticatedHeaders,
    });
  } catch (error) {
    return githubError(error, "readme");
  }

  if (readme.encoding !== "base64" || !readme.download_url) {
    return new APIError(
      "repository_readme_unavailable",
      "The repository README could not be downloaded",
      422,
      "repository_readme_unavailable",
    );
  }

  return {
    repository: {
      name: repository.name,
      fullName: repository.full_name,
      url: repository.html_url || parsed.canonicalUrl,
      description: repository.description,
      defaultBranch: repository.default_branch,
      private: repository.private,
      archived: repository.archived,
      owner: {
        login: repository.owner.login,
        avatarUrl: repository.owner.avatar_url,
      },
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      openIssues: repository.open_issues_count,
      updatedAt: repository.updated_at,
      pushedAt: repository.pushed_at,
    },
    readme: {
      content: Buffer.from(readme.content.replace(/\s/g, ""), "base64").toString(
        "utf8",
      ),
      url: readme.download_url,
      editUrl: readme.html_url.replace("/blob/", "/edit/"),
    },
  };
}
