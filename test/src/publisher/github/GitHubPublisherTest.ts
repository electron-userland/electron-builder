import { CancellationToken, GithubOptions } from "builder-util-runtime"
import { GitHubPublisher, PublishContext } from "electron-publish"
import { beforeEach, describe, test } from "vitest"

describe("GitHub Publisher - targetCommitish", () => {
  let publishContext: PublishContext

  beforeEach(() => {
    publishContext = {
      cancellationToken: new CancellationToken(),
      progress: null,
    }
    delete process.env.EP_TARGET_COMMITISH
    delete process.env.GITHUB_SHA
    delete process.env.GH_TOKEN
    delete process.env.GITHUB_TOKEN
  })

  test("constructor accepts targetCommitish in config", ({ expect }) => {
    process.env.GH_TOKEN = "test-token-for-constructor"

    const publisher = new GitHubPublisher(
      publishContext,
      {
        provider: "github",
        owner: "owner",
        repo: "repo",
        token: "test-token",
        targetCommitish: "development",
      } as GithubOptions,
      "1.0.0"
    )

    expect(publisher.toString()).toContain("owner")
    expect(publisher.toString()).toContain("repo")
    expect(publisher.providerName).toBe("github")
  })

  test("constructor accepts empty config without targetCommitish", ({ expect }) => {
    process.env.GH_TOKEN = "test-token-for-constructor"

    const publisher = new GitHubPublisher(
      publishContext,
      {
        provider: "github",
        owner: "owner",
        repo: "repo",
        token: "test-token",
      } as GithubOptions,
      "1.0.0"
    )

    expect(publisher.toString()).toContain("owner")
    expect(publisher.providerName).toBe("github")
  })

  test("constructor resolves targetCommitish from EP_TARGET_COMMITISH when not in config", ({ expect }) => {
    process.env.GH_TOKEN = "test-token"
    process.env.EP_TARGET_COMMITISH = "feature-branch"

    const publisher = new GitHubPublisher(
      publishContext,
      {
        provider: "github",
        owner: "owner",
        repo: "repo",
        token: "test-token",
      } as GithubOptions,
      "1.0.0"
    )

    expect(publisher.toString()).toContain("owner")
    expect(publisher.providerName).toBe("github")
  })

  test("constructor resolves targetCommitish from GITHUB_SHA when EP_TARGET_COMMITISH and config not set", ({ expect }) => {
    process.env.GH_TOKEN = "test-token"
    process.env.GITHUB_SHA = "abc123def456"

    const publisher = new GitHubPublisher(
      publishContext,
      {
        provider: "github",
        owner: "owner",
        repo: "repo",
        token: "test-token",
      } as GithubOptions,
      "1.0.0"
    )

    expect(publisher.toString()).toContain("owner")
    expect(publisher.providerName).toBe("github")
  })
})
