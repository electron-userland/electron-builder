import { serializeToYaml } from "builder-util"
import { CancellationToken, DEFAULT_CROSS_ORIGIN_HEADERS, UpdateInfo } from "builder-util-runtime"
import type { AppUpdater, DownloadUpdateOptions } from "electron-updater/src/AppUpdater"
import { createClient } from "electron-updater/src/providerFactory"
import { GenericProvider } from "electron-updater/src/providers/GenericProvider"
import { PrivateGitHubProvider } from "electron-updater/src/providers/PrivateGitHubProvider"
import type { Provider } from "electron-updater/src/providers/Provider"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, Server } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, type ExpectStatic, test, vi } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// autoUpdater.crossOriginHeaders chooses the request headers sent to another origin. It is required when the app sets its own headers.

const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-header-allowlist"
const INSTALLER = Buffer.from("cross-origin headers test installer — not a real executable")
const FEED = "https://feed.example.com/updates/"
const INFO: UpdateInfo = { version: "1.1.0", files: [{ url: "app-1.1.0.exe", sha512: "x", size: 10 }], releaseDate: "2024-01-01T00:00:00.000Z" }

// a custom provider (a generic one) whose downloads carry a header of its own
class ExtraHeadersProvider extends GenericProvider {
  get fileExtraDownloadHeaders(): OutgoingHttpHeaders | null {
    return { "X-Download-Key": "download-secret" }
  }
}

describe("autoUpdater.crossOriginHeaders", () => {
  const servers: Array<Server> = []
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close()
    }
    vi.restoreAllMocks()
  })

  // a local feed with a channel file that offers 1.1.0, recording every request
  async function serveFeed(tmpDir: TmpDir) {
    const root = await tmpDir.getTempDir({ prefix: "cross-origin-headers-feed" })
    await fsExtra.outputFile(
      path.join(root, "latest.yml"),
      serializeToYaml({
        version: "1.1.0",
        files: [{ url: "app-1.1.0.exe", sha512: createHash("sha512").update(INSTALLER).digest("base64"), size: INSTALLER.length }],
        releaseDate: "2024-01-01T00:00:00.000Z",
      })
    )
    const { server, port } = await createLocalServer(root)
    servers.push(server)
    const requests: Array<{ pathname: string; headers: IncomingHttpHeaders }> = []
    server.on("request", (request: IncomingMessage) => {
      requests.push({ pathname: new URL(request.url ?? "/", "http://localhost").pathname, headers: request.headers })
    })
    return { url: `http://127.0.0.1:${port}/`, requests }
  }

  async function createUpdater(tmpDir: TmpDir) {
    const feed = await serveFeed(tmpDir)
    const updater = await createNsisUpdater("1.0.0")
    updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: feed.url })
    updater.autoDownload = false
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    updater.logger = logger
    return { updater, feed, logger, events: trackEvents(updater) }
  }

  // the headers the updater sends to a download from `url`, with the feed at FEED
  function downloadHeadersFor(updater: AppUpdater, url: string, provider: Provider<any> = createFeedProvider(updater)): OutgoingHttpHeaders {
    const options: DownloadUpdateOptions = {
      updateInfoAndProvider: { info: INFO, provider },
      requestHeaders: (updater as any).computeRequestHeaders(provider),
      cancellationToken: new CancellationToken(),
    }
    return (updater as any).downloadRequestHeaders(new URL(url), options)
  }

  function createFeedProvider(updater: AppUpdater): Provider<any> {
    return createClient({ provider: "generic", url: FEED }, updater, { isUseMultipleRangeRequest: false, platform: "win32", executor: {} as any })
  }

  describe("without custom headers", () => {
    test("the update check runs with the default list, silently", async ({ tmpDir, expect }) => {
      const { updater, feed, logger, events } = await createUpdater(tmpDir)

      expect((await updater.checkForUpdates())!.isUpdateAvailable).toBe(true)
      expect(feed.requests.map(it => it.pathname)).toEqual(["/latest.yml"])
      expect(events).not.toContain("error")
      expect(logger.warn.mock.calls.map(it => String(it[0])).filter(it => it.includes("rossOrigin") || it.includes("cross-origin"))).toEqual([])
      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*" })
    })

    // the private GitHub provider's Accept and token Authorization are electron-updater's own headers
    test("the private GitHub provider's own headers do not require crossOriginHeaders", async ({ tmpDir, expect }) => {
      const { updater } = await createUpdater(tmpDir)
      const provider = createClient({ provider: "github", owner: "owner", repo: "repo", private: true, token: "github-secret" }, updater, {
        isUseMultipleRangeRequest: false,
        platform: "win32",
        executor: {} as any,
      })
      expect(provider).toBeInstanceOf(PrivateGitHubProvider)
      expect(provider.fileExtraDownloadHeaders).toHaveProperty("authorization")

      expect(() => (updater as any).checkCrossOriginHeadersConfigured(provider)).not.toThrow()
    })
  })

  describe("required with custom headers", () => {
    async function expectNotConfigured(expect: ExpectStatic, updater: AppUpdater, feed: { requests: Array<unknown> }, events: Array<string>, names: string, secret: string) {
      const error = await updater.checkForUpdates().then(
        () => null,
        (e: unknown) => e
      )
      expect(error).toMatchObject({ code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED" })
      const message = String((error as Error).message)
      expect(message).toContain(
        `Cross-origin requests and redirects of electron-updater carry only an explicit list of request headers, and the app sets its own (${names} from requestHeaders, addAuthHeader or fileExtraDownloadHeaders)`
      )
      expect(message).toContain("`autoUpdater.crossOriginHeaders = defaults => defaults`")
      expect(message.endsWith(DOCS)).toBe(true)
      expect(message).not.toContain(secret)
      // before any request
      expect(feed.requests).toEqual([])
      expect(events).toContain("error")
    }

    test("requestHeaders without crossOriginHeaders: the update check fails before any request", async ({ tmpDir, expect }) => {
      const { updater, feed, events } = await createUpdater(tmpDir)
      updater.requestHeaders = { "X-Tenant": "tenant-secret" }

      await expectNotConfigured(expect, updater, feed, events, "X-Tenant", "tenant-secret")
    })

    test("addAuthHeader without crossOriginHeaders: the update check fails before any request", async ({ tmpDir, expect }) => {
      const { updater, feed, events } = await createUpdater(tmpDir)
      updater.addAuthHeader("Bearer auth-secret")

      await expectNotConfigured(expect, updater, feed, events, "authorization", "auth-secret")
    })

    test("a custom provider's fileExtraDownloadHeaders without crossOriginHeaders: the update check fails before any request", async ({ tmpDir, expect }) => {
      const { updater, feed, events } = await createUpdater(tmpDir)
      updater.setFeedURL({ provider: "custom", updateProvider: ExtraHeadersProvider, url: feed.url } as any)

      await expectNotConfigured(expect, updater, feed, events, "X-Download-Key", "download-secret")
    })

    test("set crossOriginHeaders: the update check runs", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)
      updater.requestHeaders = { "X-Tenant": "acme" }
      updater.crossOriginHeaders = defaults => defaults

      expect((await updater.checkForUpdates())!.isUpdateAvailable).toBe(true)
      expect(feed.requests[0].headers).toMatchObject({ "x-tenant": "acme" })
    })

    test("headers set after the update check: the download fails before any request", async ({ tmpDir, expect }) => {
      const { updater } = await createUpdater(tmpDir)
      expect((await updater.checkForUpdates())!.isUpdateAvailable).toBe(true)
      const doDownloadUpdate = vi.spyOn(updater as any, "doDownloadUpdate").mockResolvedValue({ updateFile: "" })

      updater.requestHeaders = { "X-Tenant": "acme" }
      await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED" })
      expect(doDownloadUpdate).not.toHaveBeenCalled()

      updater.crossOriginHeaders = defaults => defaults
      await expect(updater.downloadUpdate()).resolves.toEqual({ updateFile: "" })
    })
  })

  describe("the list", () => {
    async function createUpdaterWithHeaders(tmpDir: TmpDir) {
      const { updater } = await createUpdater(tmpDir)
      updater.requestHeaders = { "X-Tenant": "acme" }
      updater.addAuthHeader("Bearer s")
      return updater
    }

    test("gets the default list, and sends it unchanged", async ({ tmpDir, expect }) => {
      const updater = await createUpdaterWithHeaders(tmpDir)
      const crossOriginHeaders = vi.fn((defaults: ReadonlyArray<string>) => [...defaults])
      updater.crossOriginHeaders = crossOriginHeaders

      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*" })
      expect(crossOriginHeaders).toHaveBeenCalledExactlyOnceWith(DEFAULT_CROSS_ORIGIN_HEADERS)
      // the same origin gets every header
      expect(downloadHeadersFor(updater, `${FEED}app-1.1.0.exe`)).toEqual({ accept: "*/*", "X-Tenant": "acme", authorization: "Bearer s" })
    })

    test("a header added to the list, in any case, goes to another origin; one taken out does not", async ({ tmpDir, expect }) => {
      const updater = await createUpdaterWithHeaders(tmpDir)

      updater.crossOriginHeaders = defaults => [...defaults, "x-TENANT"]
      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*", "X-Tenant": "acme" })

      updater.crossOriginHeaders = defaults => defaults.filter(it => it !== "accept")
      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toEqual({})
    })

    test("null sends every header to every origin", async ({ tmpDir, expect }) => {
      const updater = await createUpdaterWithHeaders(tmpDir)
      updater.crossOriginHeaders = () => null

      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*", "X-Tenant": "acme", authorization: "Bearer s" })
    })

    test("is resolved once, and again after the property is set", async ({ tmpDir, expect }) => {
      const updater = await createUpdaterWithHeaders(tmpDir)
      const first = vi.fn((defaults: ReadonlyArray<string>) => [...defaults, "x-tenant"])
      updater.crossOriginHeaders = first

      await updater.checkForUpdates()
      downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")
      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toHaveProperty("X-Tenant")
      expect(first).toHaveBeenCalledTimes(1)

      const second = vi.fn((defaults: ReadonlyArray<string>) => [...defaults])
      updater.crossOriginHeaders = second
      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).not.toHaveProperty("X-Tenant")
      expect(second).toHaveBeenCalledTimes(1)

      // the same function set again is called again
      updater.crossOriginHeaders = first
      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toHaveProperty("X-Tenant")
      expect(first).toHaveBeenCalledTimes(2)
    })

    test("is a copy: the app changing its array later does not change the headers sent", async ({ tmpDir, expect }) => {
      const updater = await createUpdaterWithHeaders(tmpDir)
      const list = ["accept"]
      updater.crossOriginHeaders = () => list

      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*" })
      list.push("x-tenant")
      expect(downloadHeadersFor(updater, "https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*" })
    })
  })

  describe("validation", () => {
    for (const [label, value] of [
      ["undefined", () => undefined],
      ["a string", () => "Bearer value-secret"],
      ["an object", () => ({ authorization: "Bearer value-secret" })],
      ["an empty name", () => ["accept", ""]],
      ["a name with a space", () => ["accept", "x tenant"]],
      ["a name that is not a string", () => ["accept", 42]],
    ] as const) {
      test(`a result that is ${label} fails the update check before any request`, async ({ tmpDir, expect }) => {
        const { updater, feed } = await createUpdater(tmpDir)
        updater.crossOriginHeaders = value as any

        const error = await updater.checkForUpdates().then(
          () => null,
          (e: unknown) => e
        )
        expect(error).toMatchObject({
          code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS",
          message: expect.stringMatching(/^autoUpdater\.crossOriginHeaders must return an array of header names \(such as "accept" or "x-tenant"\) or null: got /),
        })
        // never the value, which could be a header value by mistake
        expect(String((error as Error).message)).not.toContain("value-secret")
        expect(feed.requests).toEqual([])
      })
    }

    test("a value that is not a function fails the update check before any request", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)
      updater.crossOriginHeaders = ["accept"] as any

      await expect(updater.checkForUpdates()).rejects.toMatchObject({
        code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS",
        message: expect.stringContaining("autoUpdater.crossOriginHeaders must be a function that gets the default header names"),
      })
      expect(feed.requests).toEqual([])
    })

    test("a failed result is not kept: a valid one set afterwards is used", async ({ tmpDir, expect }) => {
      const { updater } = await createUpdater(tmpDir)
      updater.crossOriginHeaders = (() => "accept") as any
      await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS" })

      updater.crossOriginHeaders = defaults => defaults
      expect((await updater.checkForUpdates())!.isUpdateAvailable).toBe(true)
    })
  })
})
