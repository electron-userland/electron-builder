import { serializeToYaml } from "builder-util"
import { type CrossOriginHeadersCallback, type CrossOriginRequest, DEFAULT_CROSS_ORIGIN_HEADERS } from "builder-util-runtime"
import type { AppUpdater, CheckForUpdatesAndNotifyOptions, CheckForUpdatesOptions } from "electron-updater/src/AppUpdater"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { IncomingHttpHeaders, IncomingMessage, Server } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, test, vi } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// checkForUpdates({ crossOriginHeaders }) chooses the request headers of each request and redirect to another origin: required for every app,
// called per cross-origin request, and kept for the download of the check and the install of an update marked for the next launch.

const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-header-allowlist"
const INSTALLER = Buffer.from("cross-origin headers test installer — not a real executable")
const INSTALLER_NAME = "app-1.1.0.exe"
const useDefaults: CrossOriginHeadersCallback = defaults => defaults

describe("checkForUpdates({ crossOriginHeaders })", () => {
  const servers: Array<Server> = []
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close()
    }
    vi.restoreAllMocks()
  })

  // a local static server that records every request; two servers on different ports are different origins
  async function serve(tmpDir: TmpDir) {
    const root = await tmpDir.getTempDir({ prefix: "cross-origin-headers-server" })
    const { server, port } = await createLocalServer(root)
    servers.push(server)
    const requests: Array<{ pathname: string; headers: IncomingHttpHeaders }> = []
    server.on("request", (request: IncomingMessage) => {
      requests.push({ pathname: new URL(request.url ?? "/", "http://localhost").pathname, headers: request.headers })
    })
    const url = `http://127.0.0.1:${port}`
    return { url, origin: new URL(url).origin, requests, write: (name: string, content: string | Buffer) => fsExtra.outputFile(path.join(root, name), content) }
  }

  function channelYml(installerUrl: string) {
    return serializeToYaml({
      version: "1.1.0",
      files: [{ url: installerUrl, sha512: createHash("sha512").update(INSTALLER).digest("base64"), size: INSTALLER.length }],
      releaseDate: "2024-01-01T00:00:00.000Z",
    })
  }

  // a feed whose latest.yml points to `installerUrl` (relative: on the feed), with the app's own headers
  async function createUpdater(tmpDir: TmpDir, installerUrl: (feed: { url: string }) => string = () => INSTALLER_NAME) {
    const feed = await serve(tmpDir)
    await feed.write("latest.yml", channelYml(installerUrl(feed)))
    await feed.write(INSTALLER_NAME, INSTALLER)
    const updater = await createNsisUpdater("1.0.0")
    updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: feed.url })
    updater.autoDownload = false
    updater.requestHeaders = { "X-Tenant": "acme" }
    updater.addAuthHeader("Bearer s")
    return { updater, feed, events: trackEvents(updater) }
  }

  async function rejection(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
      () => null,
      (e: unknown) => e
    )
  }

  describe("is required", () => {
    const checks: ReadonlyArray<readonly [string, (updater: AppUpdater, options: unknown) => Promise<unknown>]> = [
      ["checkForUpdates", (updater, options) => updater.checkForUpdates(options as CheckForUpdatesOptions)],
      ["checkForUpdatesAndNotify", (updater, options) => updater.checkForUpdatesAndNotify(options as CheckForUpdatesAndNotifyOptions)],
    ]
    const invalidOptions: ReadonlyArray<readonly [string, unknown]> = [
      ["no options", undefined],
      ["no crossOriginHeaders", {}],
      ["a crossOriginHeaders that is not a function", { crossOriginHeaders: ["accept"] }],
      ["a notification in place of the options", { title: "Update", body: "{version} is ready" }],
    ]
    for (const [method, check] of checks) {
      for (const [label, options] of invalidOptions) {
        test(`${method} with ${label} fails before any request`, async ({ tmpDir, expect }) => {
          const { updater, feed, events } = await createUpdater(tmpDir)

          const error = await rejection(check(updater, options))
          expect(error).toMatchObject({
            code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
            message: `${method} requires { crossOriginHeaders }: requests and redirects to another origin carry only the headers it returns. Pass \`{ crossOriginHeaders: defaults => defaults }\` to use the built-in list. ${DOCS}`,
          })
          expect(feed.requests).toEqual([])
          expect(events).toEqual(["error"])
        })
      }
    }

    test("downloadUpdate without a check fails before any request", async ({ tmpDir, expect }) => {
      const { updater, feed, events } = await createUpdater(tmpDir)
      const doDownloadUpdate = vi.spyOn(updater as any, "doDownloadUpdate")

      const error = await rejection(updater.downloadUpdate())
      expect(error).toMatchObject({
        code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
        message: expect.stringMatching(/^downloadUpdate requires a checkForUpdates\(\{ crossOriginHeaders \}\) before it: /),
      })
      expect(doDownloadUpdate).not.toHaveBeenCalled()
      expect(feed.requests).toEqual([])
      expect(events).toEqual(["error"])
    })

    test("checkForUpdatesAndNotify passes its options on to the check", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)

      expect((await updater.checkForUpdatesAndNotify({ crossOriginHeaders: useDefaults, notification: { title: "t", body: "b" } }))!.isUpdateAvailable).toBe(true)
      expect(feed.requests.map(it => it.pathname)).toEqual(["/latest.yml"])
    })
  })

  describe("is called for each request to another origin", () => {
    test("not for the feed's origin, which gets every header", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)
      const crossOriginHeaders = vi.fn(useDefaults)

      await updater.checkForUpdates({ crossOriginHeaders })
      await updater.downloadUpdate()

      expect(crossOriginHeaders).not.toHaveBeenCalled()
      expect(feed.requests.map(it => it.pathname)).toEqual(["/latest.yml", `/${INSTALLER_NAME}`])
      for (const { headers } of feed.requests) {
        expect(headers).toMatchObject({ authorization: "Bearer s", "x-tenant": "acme" })
      }
    })

    test("a download on another origin: the default list and the request, with autoDownload", async ({ tmpDir, expect }) => {
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      const { updater, feed, events } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)
      updater.autoDownload = true
      const crossOriginHeaders = vi.fn((defaults: ReadonlyArray<string>) => [...defaults, "x-tenant"])

      const { updateFile } = (await (await updater.checkForUpdates({ crossOriginHeaders }))!.downloadPromise)!
      expect(await fsExtra.readFile(updateFile)).toEqual(INSTALLER)
      expect(events).not.toContain("error")

      expect(crossOriginHeaders).toHaveBeenCalledExactlyOnceWith(DEFAULT_CROSS_ORIGIN_HEADERS, {
        from: new URL(`${feed.url}/`),
        to: new URL(`${cdn.url}/${INSTALLER_NAME}`),
        kind: "request",
      })
      expect(cdn.requests).toHaveLength(1)
      expect(cdn.requests[0].headers).toMatchObject({ "x-tenant": "acme", accept: "*/*" })
      expect(cdn.requests[0].headers.authorization).toBeUndefined()
    })

    test("null sends every header on that request only", async ({ tmpDir, expect }) => {
      const channelHost = await serve(tmpDir)
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      await channelHost.write("x.yml", channelYml(`${cdn.url}/${INSTALLER_NAME}`))
      const { updater } = await createUpdater(tmpDir)
      updater.channel = `${channelHost.url}/x`
      const crossOriginHeaders = vi.fn((defaults: ReadonlyArray<string>, request: CrossOriginRequest) => (request.to.origin === channelHost.origin ? null : defaults))

      await updater.checkForUpdates({ crossOriginHeaders })
      await updater.downloadUpdate()

      expect(crossOriginHeaders.mock.calls.map(([, request]) => [request.kind, request.to.href])).toEqual([
        ["request", `${channelHost.url}/x.yml`],
        ["request", `${cdn.url}/${INSTALLER_NAME}`],
      ])
      expect(channelHost.requests[0].headers).toMatchObject({ authorization: "Bearer s", "x-tenant": "acme" })
      expect(cdn.requests[0].headers.authorization).toBeUndefined()
      expect(cdn.requests[0].headers["x-tenant"]).toBeUndefined()
    })

    // fail closed: the request is not made, rather than made with every header
    for (const [label, crossOriginHeaders] of [
      [
        "throws",
        () => {
          throw new Error("Bearer value-secret")
        },
      ],
      ["returns a header value", () => "Bearer value-secret"],
      ["returns a name that is not a header name", () => ["x tenant"]],
    ] as const) {
      test(`a crossOriginHeaders that ${label} fails that request, not the others`, async ({ tmpDir, expect }) => {
        const cdn = await serve(tmpDir)
        await cdn.write(INSTALLER_NAME, INSTALLER)
        const { updater, feed } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)

        // the channel file is on the feed's origin: the check runs
        expect((await updater.checkForUpdates({ crossOriginHeaders: crossOriginHeaders as unknown as CrossOriginHeadersCallback }))!.isUpdateAvailable).toBe(true)
        expect(feed.requests).toHaveLength(1)

        const error = await rejection(updater.downloadUpdate())
        expect(error).toMatchObject({ code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS", message: expect.stringContaining(`the request from ${feed.origin} to ${cdn.origin}`) })
        expect(String((error as Error).message)).not.toContain("value-secret")
        expect(cdn.requests).toEqual([])
      })
    }
  })

  describe("is kept from the last check", () => {
    test("for downloadUpdate after the check, until the next check", async ({ tmpDir, expect }) => {
      const channelHost = await serve(tmpDir)
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      await channelHost.write("x.yml", channelYml(`${cdn.url}/${INSTALLER_NAME}`))
      const { updater } = await createUpdater(tmpDir)
      updater.channel = `${channelHost.url}/x`
      const first = vi.fn((defaults: ReadonlyArray<string>, _request: CrossOriginRequest) => [...defaults, "x-tenant"])
      const second = vi.fn(useDefaults)

      await updater.checkForUpdates({ crossOriginHeaders: first })
      await updater.downloadUpdate()
      expect(first.mock.calls.map(([, request]) => request.to.origin)).toEqual([channelHost.origin, cdn.origin])
      expect(cdn.requests[0].headers["x-tenant"]).toBe("acme")

      await updater.checkForUpdates({ crossOriginHeaders: second })
      expect(first).toHaveBeenCalledTimes(2)
      expect(second).toHaveBeenCalledTimes(1)
      expect(channelHost.requests[1].headers["x-tenant"]).toBeUndefined()
    })

    // the install of an update marked for the next launch fetches the update info again first
    async function createUpdaterWithPendingInstall(tmpDir: TmpDir) {
      const channelHost = await serve(tmpDir)
      await channelHost.write("x.yml", channelYml(INSTALLER_NAME))
      const { updater, events } = await createUpdater(tmpDir)
      updater.channel = `${channelHost.url}/x`
      const pendingInstall = { getPendingInstallInfo: vi.fn().mockResolvedValue({ sha512: "pending" }), clearPendingInstallMarker: vi.fn().mockResolvedValue(undefined) }
      vi.spyOn(updater as any, "getOrCreateDownloadHelper").mockResolvedValue(pendingInstall)
      return { updater, channelHost, pendingInstall, events }
    }

    test("for the install of an update marked for the next launch", async ({ tmpDir, expect }) => {
      const { updater, channelHost, pendingInstall } = await createUpdaterWithPendingInstall(tmpDir)
      const crossOriginHeaders = vi.fn(useDefaults)
      await updater.checkForUpdates({ crossOriginHeaders })
      expect(crossOriginHeaders).toHaveBeenCalledTimes(1)

      // the cached update does not match the latest update info: its marker is cleared, after the update info request
      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(pendingInstall.clearPendingInstallMarker).toHaveBeenCalled()
      expect(channelHost.requests).toHaveLength(2)
      expect(crossOriginHeaders).toHaveBeenCalledTimes(2)
      expect(crossOriginHeaders.mock.calls[1][1]).toMatchObject({ kind: "request", to: new URL(`${channelHost.url}/x.yml`) })
    })

    test("without a check, the install of an update marked for the next launch fails at its request to another origin", async ({ tmpDir, expect }) => {
      const { updater, channelHost, pendingInstall } = await createUpdaterWithPendingInstall(tmpDir)

      await expect(updater.installPendingUpdateIfAvailable()).rejects.toMatchObject({
        code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
        message: expect.stringMatching(new RegExp(`^The request to ${channelHost.origin} requires a checkForUpdates\\(\\{ crossOriginHeaders \\}\\) before it: `)),
      })
      expect(channelHost.requests).toEqual([])
      expect(pendingInstall.clearPendingInstallMarker).not.toHaveBeenCalled()
    })
  })
})
