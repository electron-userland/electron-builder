import { serializeToYaml } from "builder-util"
import { NsisUpdater } from "electron-updater"
import type { AuthInfo } from "electron"
import type { TmpDir } from "temp-file"
import { describe, test, vi } from "vitest"
import { FakeElectronHttpExecutor, makeLogger, tuneTestUpdater } from "../helpers/updaterTestUtil.js"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"

// Electron emits `login` on an update request for any authentication challenge: a proxy's (407) or a server's (401), including a
// download host named by the update info or a redirect target. Only a proxy's challenge, or one from the feed's origin, reaches the
// app's `login` handler; any other is cancelled (the callback is called without credentials).

const CHANNEL_FILE = serializeToYaml({ version: "1.1.0", files: [{ url: "TestApp-Setup-1.1.0.exe", sha512: "c2hhNTEy", size: 1 }], releaseDate: "2024-01-01T00:00:00.000Z" })

const UPDATE_INFO = { version: "1.1.0", files: [{ url: "TestApp-Setup-1.1.0.exe", sha512: "c2hhNTEy", size: 1 }], path: "", sha512: "", releaseDate: "2024-01-01T00:00:00.000Z" }

// custom providers: one that sends the request headers to every origin, and one that does not declare its feed origin
class EveryOriginProvider {
  constructor(..._args: Array<unknown>) {}

  get feedBaseUrl(): null {
    return null
  }

  setRequestHeaders(): void {
    // nothing to do
  }

  getLatestVersion() {
    return Promise.resolve(UPDATE_INFO)
  }

  resolveFiles(): Array<never> {
    return []
  }
}

class UndeclaredOriginProvider {
  constructor(..._args: Array<unknown>) {}

  setRequestHeaders(): void {
    // nothing to do
  }

  getLatestVersion() {
    return Promise.resolve(UPDATE_INFO)
  }

  resolveFiles(): Array<never> {
    return []
  }
}

// the update check logs its own warnings (e.g. the disabled manifest signature verification)
const loginWarnings = (warns: Array<string>) => warns.filter(it => it.includes("login event"))

function challenge(host: string, port: number, isProxy = false): AuthInfo {
  return { isProxy, scheme: "basic", host, port, realm: "updates" }
}

async function createUpdater(tmpDir: TmpDir) {
  const updater = new NsisUpdater(null, new TestAppAdapter("1.0.0", await tmpDir.getTempDir({ prefix: "login-challenge-app" })))
  tuneTestUpdater(updater)
  updater.autoDownload = false
  ;(updater as any).httpExecutor = new FakeElectronHttpExecutor(() => ({ statusCode: 200, body: Buffer.from(CHANNEL_FILE) }))
  const logger = makeLogger()
  updater.logger = logger
  const forwarded: Array<AuthInfo> = []
  updater.on("login", authInfo => forwarded.push(authInfo))
  // returns whether the challenge reached the `login` listeners, and checks that a refused one was cancelled
  const answer = (authInfo: AuthInfo): boolean => {
    const callback = vi.fn()
    const before = forwarded.length
    ;(updater as any).onLoginChallenge(authInfo, callback)
    const isForwarded = forwarded.length > before
    if (!isForwarded && !(callback.mock.calls.length === 1 && callback.mock.calls[0].length === 0)) {
      throw new Error(`a refused challenge must be cancelled once without credentials, got ${JSON.stringify(callback.mock.calls)}`)
    }
    return isForwarded
  }
  return { updater, logger, answer }
}

async function checkedUpdater(tmpDir: TmpDir, feed: Parameters<NsisUpdater["setFeedURL"]>[0]) {
  const result = await createUpdater(tmpDir)
  result.updater.setFeedURL(feed)
  await result.updater.checkForUpdates()
  return result
}

describe("electron-updater login event", () => {
  test("a challenge from the feed's origin reaches the login event, one from another host is cancelled", async ({ tmpDir, expect }) => {
    const { answer } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    expect(answer(challenge("feed.example.com", 443))).toBe(true)
    // Chromium reports the host in lowercase; compared case-insensitively all the same
    expect(answer(challenge("FEED.example.com", 443))).toBe(true)
    expect(answer(challenge("downloads.example.net", 443))).toBe(false)
    // the same host on another port is another origin
    expect(answer(challenge("feed.example.com", 8443))).toBe(false)
  })

  test("a proxy's challenge reaches the login event whatever its host", async ({ tmpDir, expect }) => {
    const { answer } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    expect(answer(challenge("proxy.corp.example", 3128, true))).toBe(true)
    expect(answer(challenge("proxy.corp.example", 3128))).toBe(false)
  })

  test("the feed's port: the scheme's default, or the one in the URL", async ({ tmpDir, expect }) => {
    const { answer: http } = await checkedUpdater(tmpDir, { provider: "generic", url: "http://feed.example.com/updates" })
    expect(http(challenge("feed.example.com", 80))).toBe(true)
    expect(http(challenge("feed.example.com", 443))).toBe(false)

    const { answer: explicit } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com:8443/updates" })
    expect(explicit(challenge("feed.example.com", 8443))).toBe(true)
    expect(explicit(challenge("feed.example.com", 443))).toBe(false)
  })

  test("an IPv6 feed host matches with or without brackets", async ({ tmpDir, expect }) => {
    const { answer } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://[::1]:8443/updates" })
    expect(answer(challenge("::1", 8443))).toBe(true)
    expect(answer(challenge("[::1]", 8443))).toBe(true)
    expect(answer(challenge("::2", 8443))).toBe(false)
  })

  test("a provider whose feedBaseUrl is null forwards every challenge", async ({ tmpDir, expect }) => {
    const { answer } = await checkedUpdater(tmpDir, { provider: "custom", updateProvider: EveryOriginProvider })
    expect(answer(challenge("downloads.example.net", 443))).toBe(true)
  })

  test("a provider that does not declare feedBaseUrl forwards only a proxy's challenge", async ({ tmpDir, expect }) => {
    const { answer, logger } = await checkedUpdater(tmpDir, { provider: "custom", updateProvider: UndeclaredOriginProvider })
    expect(answer(challenge("downloads.example.net", 443))).toBe(false)
    expect(answer(challenge("proxy.corp.example", 3128, true))).toBe(true)
    expect(loginWarnings(logger.warns).join("\n")).toContain("Provider.feedBaseUrl")
  })

  test("before an update check only a proxy's challenge is forwarded", async ({ tmpDir, expect }) => {
    const { updater, answer } = await createUpdater(tmpDir)
    updater.setFeedURL({ provider: "generic", url: "https://feed.example.com/updates" })
    expect(answer(challenge("feed.example.com", 443))).toBe(false)
    expect(answer(challenge("proxy.corp.example", 3128, true))).toBe(true)
  })

  test("the feed of the latest update check applies", async ({ tmpDir, expect }) => {
    const { updater, answer } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    updater.setFeedURL({ provider: "generic", url: "https://other-feed.example.com/updates" })
    await updater.checkForUpdates()
    expect(answer(challenge("other-feed.example.com", 443))).toBe(true)
    expect(answer(challenge("feed.example.com", 443))).toBe(false)
  })

  test("a cancelled challenge is announced once per updater, with its host and the migration link", async ({ tmpDir, expect }) => {
    const { answer, logger } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    answer(challenge("downloads.example.net", 443))
    answer(challenge("cdn.example.org", 443))
    const warnings = loginWarnings(logger.warns)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("downloads.example.net:443")
    expect(warnings[0]).toContain("https://feed.example.com")
    expect(warnings[0]).toContain("https://www.electron.build/docs/migration/v27-runtime-changes#login-only-gets-proxy-and-feed-origin-challenges")

    const { answer: other, logger: otherLogger } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    other(challenge("downloads.example.net", 443))
    expect(loginWarnings(otherLogger.warns)).toHaveLength(1)
  })
})
