import { PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { Packager } from "app-builder-lib"
import { AppInfo } from "app-builder-lib/src/appInfo"
import { CancellationToken, GithubOptions } from "builder-util-runtime"
import * as path from "path"
import { afterEach, beforeEach } from "vitest"

// Unit tests for the publisher cache in PublishManager.getOrCreatePublisher
// (https://github.com/electron-userland/electron-builder/issues/10026).
// Concurrent scheduleUpload calls (e.g. zip + dmg + blockmaps of a single build) must share
// a single publisher instance — otherwise each one creates its own GitHub draft release.

const tokenEnvNames = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_RELEASE_TOKEN"] as const
const savedEnv = new Map<string, string | undefined>()

beforeEach(() => {
  for (const name of tokenEnvNames) {
    savedEnv.set(name, process.env[name])
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of tokenEnvNames) {
    const value = savedEnv.get(name)
    if (value == null) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

function fakePackager(projectDir: string): Packager {
  return {
    projectDir,
    config: {},
    onAfterPack: () => {
      // ignore
    },
    onArtifactCreated: () => {
      // ignore
    },
  } as unknown as Packager
}

// getOrCreatePublisher is private — reach it through `any`, with a minimal AppInfo
function getOrCreatePublisher(manager: PublishManager, publishConfig: GithubOptions) {
  return (manager as any).getOrCreatePublisher(publishConfig, { version: "1.0.0" } as AppInfo)
}

function createManager() {
  return new PublishManager(fakePackager(path.join(__dirname, "non-existent-project")), { publish: "always" }, new CancellationToken())
}

describe("getOrCreatePublisher", () => {
  test("concurrent calls with the same config share one publisher instance", async ({ expect }) => {
    const manager = createManager()
    // "__test__" tokens short-circuit GitHubPublisher release resolution, so no network is involved
    const publishConfig: GithubOptions = { provider: "github", owner: "foo", repo: "bar", token: "__test__" }

    // start both before either resolves — this is the racing state of #10026
    const [first, second] = await Promise.all([getOrCreatePublisher(manager, publishConfig), getOrCreatePublisher(manager, publishConfig)])
    expect(first).not.toBeNull()
    expect(first.providerName).toBe("github")
    expect(second).toBe(first)

    // later call hits the cache too
    expect(await getOrCreatePublisher(manager, publishConfig)).toBe(first)
  })

  test("failed creation propagates and is retried by a subsequent call", async ({ expect }) => {
    const manager = createManager()
    // no token anywhere — GitHubPublisher construction rejects
    const publishConfig: GithubOptions = { provider: "github", owner: "foo", repo: "bar" }

    await expect(getOrCreatePublisher(manager, publishConfig)).rejects.toThrow("GitHub Personal Access Token is not set")

    // the rejected promise must have been evicted from the cache: the same config now succeeds
    process.env.GH_TOKEN = "__test__"
    const publisher = await getOrCreatePublisher(manager, publishConfig)
    expect(publisher).not.toBeNull()
    expect(publisher.providerName).toBe("github")
  })
})
