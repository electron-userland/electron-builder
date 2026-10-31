import { loadEnv } from "app-builder-lib/internal"
import { CancellationToken } from "builder-util-runtime"
import { GitHubPublisher, GitlabPublisher, KeygenPublisher, PublishContext } from "electron-publish"
import { writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// A publish token taken from the environment is sent only to the provider's public host, a host the CI runner reports,
// or a host listed in ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS. A token set in the publish configuration goes to the configured host.

const context: PublishContext = { cancellationToken: new CancellationToken(), progress: null }
const SECRET = "env-secret-token-value"

beforeEach(() => {
  for (const name of [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GITHUB_RELEASE_TOKEN",
    "GITLAB_TOKEN",
    "KEYGEN_TOKEN",
    "GITHUB_SERVER_URL",
    "GITHUB_API_URL",
    "CI_SERVER_URL",
    "CI_API_V4_URL",
    "ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS",
  ]) {
    vi.stubEnv(name, undefined)
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function github(host?: string, token?: string) {
  return new GitHubPublisher(context, { provider: "github", owner: "acme", repo: "app", host, token }, "1.0.0")
}

function gitlab(host?: string, token?: string) {
  return new GitlabPublisher(context, { provider: "gitlab", projectId: "acme/app", host, token }, "1.0.0")
}

function keygen(host?: string) {
  return new KeygenPublisher(context, { provider: "keygen", account: "acme", product: "app", host }, "1.0.0")
}

describe("GitHub", () => {
  test.each([undefined, "github.com", "api.github.com"])("GH_TOKEN goes to the default host %s", host => {
    vi.stubEnv("GH_TOKEN", SECRET)
    expect(() => github(host)).not.toThrow()
  })

  test("GH_TOKEN is not sent to a custom host", () => {
    vi.stubEnv("GH_TOKEN", SECRET)
    let message = ""
    try {
      github("ghe.example.com")
    } catch (e: any) {
      message = e.message
    }
    expect(message).toContain('GH_TOKEN is not sent to "ghe.example.com"')
    expect(message).toContain("ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-build-changes#publish-tokens-from-the-environment-are-bound-to-the-provider-host")
    expect(message).not.toContain(SECRET)
  })

  test("GITHUB_TOKEN is not sent to a custom host", () => {
    vi.stubEnv("GITHUB_TOKEN", SECRET)
    expect(() => github("ghe.example.com")).toThrow('GITHUB_TOKEN is not sent to "ghe.example.com"')
  })

  test.each(["GITHUB_SERVER_URL", "GITHUB_API_URL"])("GH_TOKEN goes to the host in %s", name => {
    vi.stubEnv("GH_TOKEN", SECRET)
    vi.stubEnv(name, name === "GITHUB_API_URL" ? "https://ghe.example.com/api/v3" : "https://ghe.example.com")
    expect(() => github("ghe.example.com:8443")).not.toThrow()
  })

  test("GH_TOKEN goes to a host in ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", () => {
    vi.stubEnv("GH_TOKEN", SECRET)
    vi.stubEnv("ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", " other.example.com , GHE.example.com:8443,")
    expect(() => github("ghe.example.com")).not.toThrow()
  })

  test("a host GitLab CI reports does not receive GH_TOKEN", () => {
    vi.stubEnv("GH_TOKEN", SECRET)
    vi.stubEnv("CI_SERVER_URL", "https://ghe.example.com")
    expect(() => github("ghe.example.com")).toThrow('GH_TOKEN is not sent to "ghe.example.com"')
  })

  test("a token in the configuration goes to the configured host", () => {
    vi.stubEnv("GH_TOKEN", SECRET)
    expect(() => github("ghe.example.com", "config-token")).not.toThrow()
  })

  test("GITHUB_RELEASE_TOKEN still overrides the configured token and is checked as an environment token", () => {
    vi.stubEnv("GITHUB_RELEASE_TOKEN", SECRET)
    expect(() => github("ghe.example.com", "config-token")).toThrow('GITHUB_RELEASE_TOKEN is not sent to "ghe.example.com"')
    vi.stubEnv("ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", "ghe.example.com")
    expect(() => github("ghe.example.com", "config-token")).not.toThrow()
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
  ])("a host with %s is rejected, even with a token in the configuration", (_label, host) => {
    let message = ""
    try {
      github(host, "config-token")
    } catch (e: any) {
      message = e.message
    }
    expect(message).toContain("github.host must be a host name")
    expect(message).not.toContain("password")
  })

  test("an invalid ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS entry fails", () => {
    vi.stubEnv("GH_TOKEN", SECRET)
    vi.stubEnv("ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", "https://ghe.example.com")
    expect(() => github("ghe.example.com")).toThrow("ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS must be a host name")
  })
})

describe("GitLab", () => {
  test.each([undefined, "gitlab.com"])("GITLAB_TOKEN goes to the default host %s", host => {
    vi.stubEnv("GITLAB_TOKEN", SECRET)
    expect(() => gitlab(host)).not.toThrow()
  })

  test("GITLAB_TOKEN is not sent to a custom host", () => {
    vi.stubEnv("GITLAB_TOKEN", SECRET)
    expect(() => gitlab("gitlab.example.com")).toThrow('GITLAB_TOKEN is not sent to "gitlab.example.com"')
  })

  test.each(["CI_SERVER_URL", "CI_API_V4_URL"])("GITLAB_TOKEN goes to the host in %s", name => {
    vi.stubEnv("GITLAB_TOKEN", SECRET)
    vi.stubEnv(name, name === "CI_API_V4_URL" ? "https://gitlab.example.com/api/v4" : "https://gitlab.example.com")
    expect(() => gitlab("gitlab.example.com")).not.toThrow()
  })

  test("a host GitHub Actions reports does not receive GITLAB_TOKEN", () => {
    vi.stubEnv("GITLAB_TOKEN", SECRET)
    vi.stubEnv("GITHUB_SERVER_URL", "https://gitlab.example.com")
    expect(() => gitlab("gitlab.example.com")).toThrow('GITLAB_TOKEN is not sent to "gitlab.example.com"')
  })

  test("GITLAB_TOKEN goes to a host in ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", () => {
    vi.stubEnv("GITLAB_TOKEN", SECRET)
    vi.stubEnv("ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", "gitlab.example.com")
    expect(() => gitlab("gitlab.example.com")).not.toThrow()
  })

  test("a token in the configuration goes to the configured host", () => {
    vi.stubEnv("GITLAB_TOKEN", SECRET)
    expect(() => gitlab("gitlab.example.com", "config-token")).not.toThrow()
  })

  test.each(["example.com/gitlab", "example.com:8443/group/gitlab", "example.com/gitlab/"])("a host with a path (relative URL root) %s is kept in the API URL", host => {
    expect((gitlab(host, "config-token") as any).baseApiPath).toBe(`https://${host}/api/v4`)
  })

  test("GITLAB_TOKEN is bound to the host name of a host with a path", () => {
    vi.stubEnv("GITLAB_TOKEN", SECRET)
    expect(() => gitlab("example.com/gitlab")).toThrow('GITLAB_TOKEN is not sent to "example.com"')
    vi.stubEnv("CI_SERVER_URL", "https://example.com/gitlab")
    expect(() => gitlab("example.com:8443/gitlab")).not.toThrow()
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
  ])("a host with %s is rejected, even with a token in the configuration", (_label, host) => {
    let message = ""
    try {
      gitlab(host, "config-token")
    } catch (e: any) {
      message = e.message
    }
    expect(message).toContain("gitlab.host must be a host name")
    expect(message).not.toContain("password")
  })
})

describe("Keygen", () => {
  test.each([undefined, "api.keygen.sh"])("KEYGEN_TOKEN goes to the default host %s", host => {
    vi.stubEnv("KEYGEN_TOKEN", SECRET)
    expect(() => keygen(host)).not.toThrow()
  })

  test("KEYGEN_TOKEN is not sent to a custom host", () => {
    vi.stubEnv("KEYGEN_TOKEN", SECRET)
    expect(() => keygen("keygen.example.com")).toThrow('KEYGEN_TOKEN is not sent to "keygen.example.com"')
  })

  test("KEYGEN_TOKEN goes to a host in ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", () => {
    vi.stubEnv("KEYGEN_TOKEN", SECRET)
    vi.stubEnv("ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", "keygen.example.com")
    expect(() => keygen("keygen.example.com")).not.toThrow()
  })

  test("a host with user info is rejected", () => {
    vi.stubEnv("KEYGEN_TOKEN", SECRET)
    expect(() => keygen("api.keygen.sh@keygen.example.com")).toThrow("keygen.host must be a host name")
  })
})

describe("electron-builder.env", () => {
  test("cannot set the variables that decide the token hosts", async ({ tmpDir }) => {
    vi.stubEnv("OTHER_SETTING", undefined)
    const envFile = path.join(await tmpDir.createTempDir({ prefix: "publish-token-host-env" }), "electron-builder.env")
    await writeFile(
      envFile,
      [
        "ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS=ghe.example.com",
        "GITHUB_SERVER_URL=https://ghe.example.com",
        "GITHUB_API_URL=https://ghe.example.com/api/v3",
        "CI_SERVER_URL=https://gitlab.example.com",
        "CI_API_V4_URL=https://gitlab.example.com/api/v4",
        "GH_TOKEN=" + SECRET,
        "GITLAB_TOKEN=" + SECRET,
        "OTHER_SETTING=kept",
      ].join("\n")
    )
    await loadEnv(envFile)
    expect(process.env.GH_TOKEN).toBe(SECRET)
    expect(process.env.OTHER_SETTING).toBe("kept")
    for (const name of ["ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS", "GITHUB_SERVER_URL", "GITHUB_API_URL", "CI_SERVER_URL", "CI_API_V4_URL"]) {
      expect(process.env[name]).toBeUndefined()
    }
    expect(() => github("ghe.example.com")).toThrow('GH_TOKEN is not sent to "ghe.example.com"')
    expect(() => gitlab("gitlab.example.com")).toThrow('GITLAB_TOKEN is not sent to "gitlab.example.com"')
  })
})
