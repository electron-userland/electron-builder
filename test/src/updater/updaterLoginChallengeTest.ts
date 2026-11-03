import { NsisUpdater } from "electron-updater"
import { ElectronHttpExecutor, type LoginCallback } from "electron-updater/src/electronHttpExecutor"
import type { AuthInfo } from "electron"
import { EventEmitter } from "events"
import Module from "node:module"
import type { TmpDir } from "temp-file"
import { describe, test, vi } from "vitest"
import { makeLogger, tuneTestUpdater } from "../helpers/updaterTestUtil.js"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"

// Electron emits `login` on an update request for any authentication challenge: a proxy's (407) or a server's (401). The updater emits it
// as its own `login` event with the URL of that request, so a handler answers only the proxy or the origin its credentials are meant for.
// A challenge nothing answers is cancelled: the callback is called without credentials.

const DOWNLOAD_URL = new URL("https://downloads.example.net/TestApp-Setup-1.1.0.exe")

function challenge(host: string, port: number, isProxy = false): AuthInfo {
  return { isProxy, scheme: "basic", host, port, realm: "updates" }
}

async function createUpdater(tmpDir: TmpDir) {
  const updater = new NsisUpdater(null, new TestAppAdapter("1.0.0", await tmpDir.getTempDir({ prefix: "login-challenge-app" })))
  tuneTestUpdater(updater)
  updater.logger = makeLogger()
  return updater
}

// Electron's `login` event of a request to `requestUrl`, as the updater's executor reports it
function emitChallenge(updater: NsisUpdater, authInfo: AuthInfo, requestUrl: URL | null) {
  const callback = vi.fn()
  ;(updater as any).handleLoginChallenge(authInfo, callback, requestUrl)
  return callback
}

describe("electron-updater login event", () => {
  test("gets every challenge, a proxy's or a server's, with the URL of the request that got it", async ({ tmpDir, expect }) => {
    const updater = await createUpdater(tmpDir)
    const onLogin = vi.fn()
    updater.on("login", onLogin)
    const server = challenge("downloads.example.net", 443)
    const proxy = challenge("proxy.corp.example", 3128, true)
    const feedUrl = new URL("https://feed.example.com/updates/latest.yml")

    const serverCallback = emitChallenge(updater, server, DOWNLOAD_URL)
    const proxyCallback = emitChallenge(updater, proxy, feedUrl)

    expect(onLogin.mock.calls).toEqual([
      [server, serverCallback, DOWNLOAD_URL.href],
      [proxy, proxyCallback, feedUrl.href],
    ])
    // left to the handler, which did not answer
    expect(serverCallback).not.toHaveBeenCalled()
    expect(proxyCallback).not.toHaveBeenCalled()
  })

  test("a handler answers by the request's origin: credentials for the feed, a cancel for another origin", async ({ tmpDir, expect }) => {
    const updater = await createUpdater(tmpDir)
    updater.on("login", (authInfo, callback, url) => {
      if (authInfo.isProxy || new URL(url).origin === "https://feed.example.com") {
        callback("user", "secret")
      } else {
        callback()
      }
    })

    // same host and port as the feed in authInfo, but over http: another origin
    expect(emitChallenge(updater, challenge("feed.example.com", 443), new URL("http://feed.example.com:443/updates/latest.yml")).mock.calls).toEqual([[]])
    expect(emitChallenge(updater, challenge("downloads.example.net", 443), DOWNLOAD_URL).mock.calls).toEqual([[]])
    expect(emitChallenge(updater, challenge("feed.example.com", 443), new URL("https://feed.example.com/updates/latest.yml")).mock.calls).toEqual([["user", "secret"]])
  })

  test("a challenge on a request whose URL is unknown is cancelled once, without emitting login", async ({ tmpDir, expect }) => {
    const updater = await createUpdater(tmpDir)
    const onLogin = vi.fn()
    updater.on("login", onLogin)

    expect(emitChallenge(updater, challenge("downloads.example.net", 443), null).mock.calls).toEqual([[]])
    expect(onLogin).not.toHaveBeenCalled()
  })

  test("without a login listener a challenge is cancelled once, without credentials", async ({ tmpDir, expect }) => {
    const updater = await createUpdater(tmpDir)

    expect(emitChallenge(updater, challenge("feed.example.com", 443), new URL("https://feed.example.com/updates/latest.yml")).mock.calls).toEqual([[]])
    expect(emitChallenge(updater, challenge("proxy.corp.example", 3128, true), DOWNLOAD_URL).mock.calls).toEqual([[]])
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
    ["an empty hostname", { protocol: "https:", hostname: "", path: "/a.exe" }, null],
    ["an empty host", { protocol: "https:", host: "", hostname: "downloads.example.net", path: "/a.exe" }, "https://downloads.example.net/a.exe"],
    ["no protocol", { hostname: "downloads.example.net", path: "/a.exe" }, null],
    ["a hostname that is no URL host", { protocol: "https:", hostname: "downloads example net", path: "/a.exe" }, null],
  ])("passes the request URL from options with %s", ([_what, options, expected], { expect }) => {
    const requests: Array<EventEmitter> = []
    const listener = vi.fn<(authInfo: AuthInfo, callback: LoginCallback, requestUrl: URL | null) => void>()
    withElectron(requests, () => {
      new ElectronHttpExecutor(listener, () => ({})).createRequest(options, () => undefined)
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

// Without an app adapter, the updater builds its own ElectronHttpExecutor: Electron's `login` event on its requests goes to the updater's
// `login` event, with the request URL.
describe("the updater's own executor", () => {
  test("emits Electron's login event with the request URL, and a handler cancels by calling the callback without credentials", ({ expect }) => {
    const requests: Array<EventEmitter> = []
    withElectron(requests, () => {
      const updater = new NsisUpdater()
      updater.logger = makeLogger()
      const onLogin = vi.fn()
      // the documented handler: a proxy, or a server on the feed's origin, gets the credentials
      updater.on("login", (authInfo, callback, url) => {
        onLogin(authInfo, callback, url)
        if (authInfo.isProxy || new URL(url).origin === "https://feed.example.com") {
          callback("user", "secret")
        } else {
          callback()
        }
      })
      updater.httpExecutor.createRequest({ protocol: "https:", hostname: "downloads.example.net", path: "/TestApp-Setup-1.1.0.exe" }, () => undefined)

      const server = challenge("downloads.example.net", 443)
      const serverCallback = vi.fn()
      requests[0].emit("login", server, serverCallback)
      expect(serverCallback.mock.calls).toEqual([[]])

      const proxy = challenge("proxy.corp.example", 3128, true)
      const proxyCallback = vi.fn()
      requests[0].emit("login", proxy, proxyCallback)
      expect(proxyCallback.mock.calls).toEqual([["user", "secret"]])

      expect(onLogin.mock.calls).toEqual([
        [server, serverCallback, DOWNLOAD_URL.href],
        [proxy, proxyCallback, DOWNLOAD_URL.href],
      ])
    })
  })
})
