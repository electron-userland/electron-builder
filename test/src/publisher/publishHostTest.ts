import { CancellationToken } from "builder-util-runtime"
import { GitHubPublisher, GitlabPublisher, KeygenPublisher, PublishContext } from "electron-publish"
import { afterEach, describe, expect, test, vi } from "vitest"

// `github.host`, `gitlab.host` and `keygen.host` must be an ASCII host name with an optional port (and for GitLab an optional path).

const context: PublishContext = { cancellationToken: new CancellationToken(), progress: null }
const TOKEN = "config-token"

afterEach(() => {
  vi.unstubAllEnvs()
})

function github(host?: string) {
  return new GitHubPublisher(context, { provider: "github", owner: "acme", repo: "app", host, token: TOKEN }, "1.0.0")
}

function gitlab(host?: string) {
  return new GitlabPublisher(context, { provider: "gitlab", projectId: "acme/app", host, token: TOKEN }, "1.0.0")
}

function keygen(host?: string) {
  vi.stubEnv("KEYGEN_TOKEN", TOKEN)
  return new KeygenPublisher(context, { provider: "keygen", account: "acme", product: "app", host }, "1.0.0")
}

function errorMessage(create: () => unknown): string {
  try {
    create()
  } catch (e: any) {
    return e.message
  }
  return ""
}

describe("GitHub", () => {
  test.each([undefined, "github.com", "api.github.com", "ghe.example.com", "ghe.example.com:8443", "[::1]:8443", "xn--bcher-kva.example"])("host %s is accepted", host => {
    expect(() => github(host)).not.toThrow()
  })

  test.each([
    ["user info", "user:password@ghe.example.com"],
    ["a path (accepted only for GitLab)", "ghe.example.com/api"],
    ["a backslash", "ghe.example.com\\api"],
    ["a query", "ghe.example.com?x=1"],
    ["a fragment", "ghe.example.com#x"],
    ["whitespace", " ghe.example.com"],
    ["a percent-encoded character", "%61pi.github.com"],
    ["a semicolon", "ghe.example.com;api.github.com"],
    ["a non-ASCII character", "ａｐｉ.github.com"],
  ])("a host with %s is rejected", (_label, host) => {
    const message = errorMessage(() => github(host))
    expect(message).toContain("github.host must be a host name")
    expect(message).not.toContain("password")
  })
})

describe("GitLab", () => {
  test.each(["example.com/gitlab", "example.com:8443/group/gitlab", "example.com/gitlab/"])("a host with a path (relative URL root) %s is kept in the API URL", host => {
    expect((gitlab(host) as any).baseApiPath).toBe(`https://${host}/api/v4`)
  })

  test.each([
    ["user info", "user:password@example.com/gitlab"],
    ["user info in the path", "example.com/user:password@evil.example.com"],
    ["a query", "example.com/gitlab?x=1"],
    ["a fragment", "example.com/gitlab#x"],
    ["a backslash", "example.com\\gitlab"],
    ["an empty path segment", "example.com//evil.example.com"],
    ["a percent-encoded character", "example.com/%2e%2e"],
    ["no host name", "/gitlab"],
  ])("a host with %s is rejected", (_label, host) => {
    const message = errorMessage(() => gitlab(host))
    expect(message).toContain("gitlab.host must be a host name")
    expect(message).not.toContain("password")
  })
})

describe("Keygen", () => {
  test.each([undefined, "api.keygen.sh", "keygen.example.com"])("host %s is accepted", host => {
    expect(() => keygen(host)).not.toThrow()
  })

  test.each([
    ["user info", "api.keygen.sh@keygen.example.com"],
    ["a path", "keygen.example.com/v1"],
  ])("a host with %s is rejected", (_label, host) => {
    expect(() => keygen(host)).toThrow("keygen.host must be a host name")
  })
})
