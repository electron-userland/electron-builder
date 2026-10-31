import { serializeToYaml } from "builder-util"
import { NsisUpdater, Provider, type ProviderRuntimeOptions } from "electron-updater"
import { ElectronHttpExecutor, type LoginCallback } from "electron-updater/src/electronHttpExecutor"
import type { AuthInfo } from "electron"
import { EventEmitter } from "events"
import Module from "node:module"
import type { TmpDir } from "temp-file"
import { describe, test, vi } from "vitest"
import { FakeElectronHttpExecutor, makeLogger, tuneTestUpdater } from "../helpers/updaterTestUtil.js"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"

// Electron emits `login` on an update request for any authentication challenge: a proxy's (407) or a server's (401). The updater emits it
// as its own `login` event unless the provider of its latest update check declines it (Provider.onLoginChallenge), which cancels it: the
// callback is called without credentials.

const CHANNEL_FILE = serializeToYaml({ version: "1.1.0", files: [{ url: "TestApp-Setup-1.1.0.exe", sha512: "c2hhNTEy", size: 1 }], releaseDate: "2024-01-01T00:00:00.000Z" })

const UPDATE_INFO = { version: "1.1.0", files: [{ url: "TestApp-Setup-1.1.0.exe", sha512: "c2hhNTEy", size: 1 }], path: "", sha512: "", releaseDate: "2024-01-01T00:00:00.000Z" }

const DOWNLOAD_URL = new URL("https://downloads.example.net/TestApp-Setup-1.1.0.exe")

// a custom provider, as an app writes one: the challenges it gets, and its answer
class TestProvider extends Provider<typeof UPDATE_INFO> {
  static answer: (authInfo: AuthInfo, url: URL) => unknown = () => true
  static readonly challenges: Array<[AuthInfo, URL]> = []

  constructor(_options: unknown, _updater: unknown, runtimeOptions: ProviderRuntimeOptions) {
    super(runtimeOptions)
  }

  get feedBaseUrl(): URL {
    return new URL("https://feed.example.com/updates")
  }

  getLatestVersion() {
    return Promise.resolve(UPDATE_INFO)
  }

  resolveFiles(): Array<never> {
    return []
  }

  onLoginChallenge(authInfo: AuthInfo, url: URL): boolean {
    TestProvider.challenges.push([authInfo, url])
    // a plain-JavaScript override may return anything
    return TestProvider.answer(authInfo, url) as boolean
  }
}

// a custom provider that does not extend Provider, so has no onLoginChallenge
class DuckTypedProvider {
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
  // returns whether the challenge reached the `login` listeners, and checks that a declined one was cancelled
  const answer = (authInfo: AuthInfo, requestUrl: URL | null = DOWNLOAD_URL): boolean => {
    const callback = vi.fn()
    const before = forwarded.length
    ;(updater as any).handleLoginChallenge(authInfo, callback, requestUrl)
    const isForwarded = forwarded.length > before
    if (isForwarded ? callback.mock.calls.length !== 0 : !(callback.mock.calls.length === 1 && callback.mock.calls[0].length === 0)) {
      throw new Error(`a declined challenge must be cancelled once without credentials, an emitted one left to the handler, got ${JSON.stringify(callback.mock.calls)}`)
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

function withProviderAnswer(answer: (authInfo: AuthInfo, url: URL) => unknown): void {
  TestProvider.answer = answer
  TestProvider.challenges.length = 0
}

describe("electron-updater login event", () => {
  test("a built-in provider emits every challenge, a proxy's or a server's", async ({ tmpDir, expect }) => {
    const { answer } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    expect(answer(challenge("feed.example.com", 443))).toBe(true)
    expect(answer(challenge("downloads.example.net", 443))).toBe(true)
    expect(answer(challenge("proxy.corp.example", 3128, true))).toBe(true)
  })

  test("a provider's onLoginChallenge gets the challenge and its request URL, and returning false cancels it", async ({ tmpDir, expect }) => {
    withProviderAnswer(authInfo => authInfo.isProxy)
    const { answer } = await checkedUpdater(tmpDir, { provider: "custom", updateProvider: TestProvider })
    const server = challenge("downloads.example.net", 443)
    const proxy = challenge("proxy.corp.example", 3128, true)
    expect(answer(server)).toBe(false)
    expect(answer(proxy, new URL("https://feed.example.com/updates/latest.yml"))).toBe(true)
    expect(TestProvider.challenges).toEqual([
      [server, DOWNLOAD_URL],
      [proxy, new URL("https://feed.example.com/updates/latest.yml")],
    ])
  })

  test("anything but true from onLoginChallenge cancels the challenge", async ({ tmpDir, expect }) => {
    withProviderAnswer(() => undefined)
    const { answer } = await checkedUpdater(tmpDir, { provider: "custom", updateProvider: TestProvider })
    expect(answer(challenge("downloads.example.net", 443))).toBe(false)
    withProviderAnswer(() => "yes")
    expect(answer(challenge("downloads.example.net", 443))).toBe(false)
  })

  test("a throwing onLoginChallenge cancels the challenge and is logged once", async ({ tmpDir, expect }) => {
    withProviderAnswer(() => {
      throw new Error("provider check failed")
    })
    const { answer, logger } = await checkedUpdater(tmpDir, { provider: "custom", updateProvider: TestProvider })
    expect(answer(challenge("downloads.example.net", 443))).toBe(false)
    expect(answer(challenge("proxy.corp.example", 3128, true))).toBe(false)
    const errors = logger.errors.filter(it => it.includes("onLoginChallenge"))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("provider check failed")
  })

  test("a custom provider without onLoginChallenge emits every challenge", async ({ tmpDir, expect }) => {
    const { answer } = await checkedUpdater(tmpDir, { provider: "custom", updateProvider: DuckTypedProvider })
    expect(answer(challenge("downloads.example.net", 443))).toBe(true)
  })

  test("before an update check every challenge is emitted", async ({ tmpDir, expect }) => {
    withProviderAnswer(() => false)
    const { updater, answer } = await createUpdater(tmpDir)
    updater.setFeedURL({ provider: "custom", updateProvider: TestProvider })
    expect(answer(challenge("downloads.example.net", 443))).toBe(true)
    expect(TestProvider.challenges).toEqual([])
  })

  test("the provider of the latest update check decides", async ({ tmpDir, expect }) => {
    withProviderAnswer(() => false)
    const { updater, answer } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    updater.setFeedURL({ provider: "custom", updateProvider: TestProvider })
    await updater.checkForUpdates()
    expect(answer(challenge("downloads.example.net", 443))).toBe(false)
  })

  test("a challenge on a request whose URL is unknown is cancelled", async ({ tmpDir, expect }) => {
    const { answer } = await checkedUpdater(tmpDir, { provider: "generic", url: "https://feed.example.com/updates" })
    expect(answer(challenge("downloads.example.net", 443), null)).toBe(false)
  })
})

// a stand-in for the "electron" module while `run` runs: its net.request returns an EventEmitter, pushed to `requests`
function withElectron(requests: Array<EventEmitter>, run: () => void): void {
  const electron = {
    app: Object.assign(new EventEmitter(), {
      whenReady: () => new Promise<void>(() => undefined),
      getVersion: () => "1.0.0",
      getName: () => "login-challenge-app",
      getAppPath: () => __dirname,
      getPath: () => __dirname,
      isPackaged: false,
    }),
    session: { fromPartition: () => ({}) },
    net: {
      request: () => {
        const request = new EventEmitter()
        requests.push(request)
        return request
      },
    },
  }
  const moduleInternals = Module as unknown as { _load: (request: string, ...rest: Array<unknown>) => unknown }
  const load = moduleInternals._load
  moduleInternals._load = function (this: unknown, request: string, ...rest: Array<unknown>) {
    return request === "electron" ? electron : load.call(this, request, ...rest)
  }
  try {
    run()
  } finally {
    moduleInternals._load = load
  }
}

describe("ElectronHttpExecutor login event", () => {
  test.for<[string, Record<string, unknown>, string | null]>([
    [
      "hostname and path",
      { protocol: "https:", hostname: "downloads.example.net", path: "/TestApp-Setup-1.1.0.exe?token=1" },
      "https://downloads.example.net/TestApp-Setup-1.1.0.exe?token=1",
    ],
    ["a port", { protocol: "http:", hostname: "downloads.example.net", port: "8080", path: "/a.exe" }, "http://downloads.example.net:8080/a.exe"],
    ["an IPv6 host and no path", { protocol: "https:", hostname: "[::1]", port: "9443" }, "https://[::1]:9443/"],
    [
      "a Host header, which wins",
      { protocol: "https:", hostname: "bucket.s3.amazonaws.com", path: "/a.exe", headers: { Host: "cdn.example.org" } },
      "https://cdn.example.org/a.exe",
    ],
    ["no hostname", { protocol: "https:", path: "/a.exe" }, null],
    ["no protocol", { hostname: "downloads.example.net", path: "/a.exe" }, null],
    ["a hostname that is no URL host", { protocol: "https:", hostname: "downloads example net", path: "/a.exe" }, null],
  ])("passes the request URL from options with %s", ([_what, options, expected], { expect }) => {
    const requests: Array<EventEmitter> = []
    const listener = vi.fn<(authInfo: AuthInfo, callback: LoginCallback, requestUrl: URL | null) => void>()
    withElectron(requests, () => {
      new ElectronHttpExecutor(listener).createRequest(options, () => undefined)
    })
    const authInfo = challenge("downloads.example.net", 443)
    const callback = vi.fn()
    requests[0].emit("login", authInfo, callback)
    expect(listener).toHaveBeenCalledTimes(1)
    const [actualAuthInfo, actualCallback, requestUrl] = listener.mock.calls[0]
    expect(actualAuthInfo).toBe(authInfo)
    expect(actualCallback).toBe(callback)
    expect(requestUrl == null ? null : requestUrl.href).toBe(expected)
  })
})

// Without an app adapter, the updater builds its own ElectronHttpExecutor: Electron's `login` event on its requests goes to the provider.
describe("the updater's own executor", () => {
  test("routes Electron's login event with the request URL to the provider, and a handler cancels by calling the callback without credentials", ({ expect }) => {
    const requests: Array<EventEmitter> = []
    withElectron(requests, () => {
      withProviderAnswer(authInfo => authInfo.isProxy)
      const updater = new NsisUpdater()
      updater.logger = makeLogger()
      // the provider of an update check (which needs a ready app)
      ;(updater as any).loginChallengeProvider = new TestProvider(null, null, { isUseMultipleRangeRequest: true, platform: "win32", executor: updater.httpExecutor })
      const onLogin = vi.fn()
      // the documented way to cancel: call the callback without credentials
      updater.on("login", (authInfo, callback) => {
        onLogin(authInfo, callback)
        callback()
      })
      updater.httpExecutor.createRequest({ protocol: "https:", hostname: "downloads.example.net", path: "/TestApp-Setup-1.1.0.exe" }, () => undefined)

      const server = challenge("downloads.example.net", 443)
      const serverCallback = vi.fn()
      requests[0].emit("login", server, serverCallback)
      expect(serverCallback.mock.calls).toEqual([[]])
      expect(onLogin).not.toHaveBeenCalled()

      const proxy = challenge("proxy.corp.example", 3128, true)
      const proxyCallback = vi.fn()
      requests[0].emit("login", proxy, proxyCallback)
      expect(onLogin).toHaveBeenCalledTimes(1)
      expect(onLogin.mock.calls[0][1]).toBe(proxyCallback)
      expect(proxyCallback.mock.calls).toEqual([[]])
      expect(TestProvider.challenges).toEqual([
        [server, DOWNLOAD_URL],
        [proxy, DOWNLOAD_URL],
      ])
    })
  })
})
