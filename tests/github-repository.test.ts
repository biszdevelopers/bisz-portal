import { describe, expect, test } from "bun:test";
import { parseGitHubRepositoryUrl } from "../server/utils/github-repository";

describe("GitHub repository URL parsing", () => {
  test("accepts canonical GitHub repository URLs", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/openai/openai-node")).toEqual({
      owner: "openai",
      repository: "openai-node",
      canonicalUrl: "https://github.com/openai/openai-node",
    });
    expect(
      parseGitHubRepositoryUrl("https://www.github.com/openai/openai-node.git/"),
    ).toEqual({
      owner: "openai",
      repository: "openai-node",
      canonicalUrl: "https://github.com/openai/openai-node",
    });
  });

  test("rejects non-GitHub and non-repository URLs", () => {
    expect(parseGitHubRepositoryUrl("https://example.com/openai/openai-node")).toBeNull();
    expect(parseGitHubRepositoryUrl("http://github.com/openai/openai-node")).toBeNull();
    expect(parseGitHubRepositoryUrl("https://github.com/openai")).toBeNull();
    expect(
      parseGitHubRepositoryUrl("https://github.com/openai/openai-node/issues"),
    ).toBeNull();
  });
});
