import { serializeToYaml } from "builder-util"
import { type CrossOriginHeadersCallback, type CrossOriginRequest, type CustomPublishOptions, DEFAULT_CROSS_ORIGIN_HEADERS } from "builder-util-runtime"
import type { AppUpdater, CheckForUpdatesAndNotifyOptions, CheckForUpdatesOptions } from "electron-updater/src/AppUpdater"
import { DEFAULT_CROSS_ORIGIN_HEADERS as UPDATER_DEFAULT_CROSS_ORIGIN_HEADERS } from "electron-updater/src/index"
import { GenericProvider } from "electron-updater/src/providers/GenericProvider"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type OutgoingHttpHeaders, type Server } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, test, vi } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, TestNodeHttpExecutor, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// checkForUpdates({ crossOriginHeaderAllowlist }) decides the request headers of each request and redirect to another origin than the update
// provider's feedBaseUrl: a list, or a callback asked per cross-origin request. Required for every app, and kept for the download of the check
// and the install of an update marked for the next launch.

const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-header-allowlist"
const INSTALLER = Buffer.from("cross-origin headers test installer — not a real executable")
const INSTALLER_NAME = "app-1.1.0.exe"
const useDefaults: CrossOriginHeadersCallback = defaults => defaults

describe("checkForUpdates({ crossOriginHeaderAllowlist })", () => {
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

  const checks: ReadonlyArray<readonly [string, string, (updater: AppUpdater, options: unknown) => Promise<unknown>]> = [
    [
      "checkForUpdates",
      "checkForUpdates requires { crossOriginHeaderAllowlist } or the updater's crossOriginHeaderAllowlist",
      (updater, options) => updater.checkForUpdates(options as CheckForUpdatesOptions),
    ],
    [
      "checkForUpdatesAndNotify",
      "checkForUpdatesAndNotify requires { crossOriginHeaderAllowlist } or the updater's crossOriginHeaderAllowlist, with the notification in the same options object: { crossOriginHeaderAllowlist, notification }",
      (updater, options) => updater.checkForUpdatesAndNotify(options as CheckForUpdatesAndNotifyOptions),
    ],
  ]

  describe("is required", () => {
    const invalidOptions: ReadonlyArray<readonly [string, unknown]> = [
      ["no options", undefined],
      ["no crossOriginHeaderAllowlist", {}],
      ["a crossOriginHeaderAllowlist that is a string", { crossOriginHeaderAllowlist: "accept" }],
      ["a crossOriginHeaderAllowlist of null", { crossOriginHeaderAllowlist: null }],
      ["a notification in place of the options", { title: "Update", body: "{version} is ready" }],
    ]
    for (const [method, requirement, check] of checks) {
      for (const [label, options] of invalidOptions) {
        test(`${method} with ${label} emits error and rejects before any request`, async ({ tmpDir, expect }) => {
          const { updater, feed, events } = await createUpdater(tmpDir)
          const errors: Array<Error> = []
          updater.on("error", error => errors.push(error))

          const error = await rejection(check(updater, options))
          expect(error).toMatchObject({
            code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
            message: `${requirement}: requests and redirects to another origin carry only the headers it allows, a list of header names or a callback. Pass \`{ crossOriginHeaderAllowlist: DEFAULT_CROSS_ORIGIN_HEADERS }\` (from electron-updater) to send the default headers. ${DOCS}`,
          })
          expect(feed.requests).toEqual([])
          expect(events).toEqual(["error"])
          expect(errors).toEqual([error])
        })
      }
    }

    test("downloadUpdate without a check fails before any request", async ({ tmpDir, expect }) => {
      const { updater, feed, events } = await createUpdater(tmpDir)
      const doDownloadUpdate = vi.spyOn(updater as any, "doDownloadUpdate")

      const error = await rejection(updater.downloadUpdate())
      expect(error).toMatchObject({
        code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
        message: expect.stringMatching(/^downloadUpdate requires a checkForUpdates\(\{ crossOriginHeaderAllowlist \}\) before it: /),
      })
      expect(doDownloadUpdate).not.toHaveBeenCalled()
      expect(feed.requests).toEqual([])
      expect(events).toEqual(["error"])
    })

    test("checkForUpdatesAndNotify passes its options on to the check", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)

      expect((await updater.checkForUpdatesAndNotify({ crossOriginHeaderAllowlist: useDefaults, notification: { title: "t", body: "b" } }))!.isUpdateAvailable).toBe(true)
      expect(feed.requests.map(it => it.pathname)).toEqual(["/latest.yml"])
    })

    test("checkForUpdatesAndNotify passes a list on to the check", async ({ tmpDir, expect }) => {
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      const { updater } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)

      await updater.checkForUpdatesAndNotify({ crossOriginHeaderAllowlist: ["x-tenant"], notification: { title: "t", body: "b" } })
      await updater.downloadUpdate()

      expect(cdn.requests).toHaveLength(1)
      expect(cdn.requests[0].headers["x-tenant"]).toBe("acme")
      expect(cdn.requests[0].headers.authorization).toBeUndefined()
    })
  })

  describe("a callback is called for each request to another origin", () => {
    test("not for the feed's origin, which gets every header", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)
      const crossOriginHeaderAllowlist = vi.fn(useDefaults)

      await updater.checkForUpdates({ crossOriginHeaderAllowlist })
      await updater.downloadUpdate()

      expect(crossOriginHeaderAllowlist).not.toHaveBeenCalled()
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
      const crossOriginHeaderAllowlist = vi.fn((defaults: ReadonlyArray<string>) => [...defaults, "x-tenant"])

      const { updateFile } = (await (await updater.checkForUpdates({ crossOriginHeaderAllowlist }))!.downloadPromise)!
      expect(await fsExtra.readFile(updateFile)).toEqual(INSTALLER)
      expect(events).not.toContain("error")

      expect(crossOriginHeaderAllowlist).toHaveBeenCalledExactlyOnceWith(DEFAULT_CROSS_ORIGIN_HEADERS, {
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
      const crossOriginHeaderAllowlist = vi.fn((defaults: ReadonlyArray<string>, request: CrossOriginRequest) => (request.to.origin === channelHost.origin ? null : defaults))

      await updater.checkForUpdates({ crossOriginHeaderAllowlist })
      await updater.downloadUpdate()

      expect(crossOriginHeaderAllowlist.mock.calls.map(([, request]) => [request.kind, request.to.href])).toEqual([
        ["request", `${channelHost.url}/x.yml`],
        ["request", `${cdn.url}/${INSTALLER_NAME}`],
      ])
      expect(channelHost.requests[0].headers).toMatchObject({ authorization: "Bearer s", "x-tenant": "acme" })
      expect(cdn.requests[0].headers.authorization).toBeUndefined()
      expect(cdn.requests[0].headers["x-tenant"]).toBeUndefined()
    })

    // fail closed: the request is not made, rather than made with every header
    for (const [label, crossOriginHeaderAllowlist] of [
      [
        "throws",
        () => {
          throw new Error("Bearer value-secret")
        },
      ],
      ["returns a header value", () => "Bearer value-secret"],
      ["returns a name that is not a header name", () => ["x tenant"]],
    ] as const) {
      test(`a crossOriginHeaderAllowlist callback that ${label} fails that request, not the others`, async ({ tmpDir, expect }) => {
        const cdn = await serve(tmpDir)
        await cdn.write(INSTALLER_NAME, INSTALLER)
        const { updater, feed } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)

        // the channel file is on the feed's origin: the check runs
        expect((await updater.checkForUpdates({ crossOriginHeaderAllowlist: crossOriginHeaderAllowlist as unknown as CrossOriginHeadersCallback }))!.isUpdateAvailable).toBe(true)
        expect(feed.requests).toHaveLength(1)

        const error = await rejection(updater.downloadUpdate())
        expect(error).toMatchObject({ code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS", message: expect.stringContaining(`the request from ${feed.origin} to ${cdn.origin}`) })
        expect(String((error as Error).message)).not.toContain("value-secret")
        expect(cdn.requests).toEqual([])
      })
    }
  })

  describe("a list", () => {
    test("is exactly what a download on another origin gets, case-insensitive: a default left out is not sent, a listed header is", async ({ tmpDir, expect }) => {
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      const { updater, events } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)
      // a default cross-origin header the list leaves out
      updater.requestHeaders = { ...updater.requestHeaders, "Accept-Language": "de" }

      await updater.checkForUpdates({ crossOriginHeaderAllowlist: ["Accept", "x-tenant"] })
      await updater.downloadUpdate()

      expect(events).not.toContain("error")
      expect(cdn.requests).toHaveLength(1)
      expect(cdn.requests[0].headers).toMatchObject({ accept: "*/*", "x-tenant": "acme" })
      expect(cdn.requests[0].headers["accept-language"]).toBeUndefined()
      expect(cdn.requests[0].headers.authorization).toBeUndefined()
    })

    // checked per request, like what a callback returns: the check on the feed's origin runs, the request to another origin is not sent
    for (const [label, allowlist] of [
      ["an entry that is not a string", [1, "accept"]],
      ["an entry that is not a header name", ["accept", "bad header"]],
    ] as const) {
      test(`with ${label} fails each request to another origin with ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS`, async ({ tmpDir, expect }) => {
        const cdn = await serve(tmpDir)
        await cdn.write(INSTALLER_NAME, INSTALLER)
        const { updater, feed } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)

        expect((await updater.checkForUpdates({ crossOriginHeaderAllowlist: allowlist as unknown as ReadonlyArray<string> }))!.isUpdateAvailable).toBe(true)
        expect(feed.requests).toHaveLength(1)

        const error = await rejection(updater.downloadUpdate())
        expect(error).toMatchObject({
          code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS",
          message: expect.stringContaining(`crossOriginHeaderAllowlist of checkForUpdates must return an array of header names`),
        })
        expect(cdn.requests).toEqual([])
      })
    }

    test("is what a channel file on another origin gets, read again for each check", async ({ tmpDir, expect }) => {
      const channelHost = await serve(tmpDir)
      await channelHost.write("x.yml", channelYml(INSTALLER_NAME))
      const { updater } = await createUpdater(tmpDir)
      updater.channel = `${channelHost.url}/x`
      updater.requestHeaders = { ...updater.requestHeaders, "Accept-Language": "de" }

      await updater.checkForUpdates({ crossOriginHeaderAllowlist: ["accept-language"] })
      expect(channelHost.requests).toHaveLength(1)
      expect(channelHost.requests[0].headers["accept-language"]).toBe("de")
      expect(channelHost.requests[0].headers["x-tenant"]).toBeUndefined()
      expect(channelHost.requests[0].headers.authorization).toBeUndefined()

      await updater.checkForUpdates({ crossOriginHeaderAllowlist: ["x-tenant"] })
      expect(channelHost.requests).toHaveLength(2)
      expect(channelHost.requests[1].headers["x-tenant"]).toBe("acme")
      expect(channelHost.requests[1].headers["accept-language"]).toBeUndefined()
      expect(channelHost.requests[1].headers.authorization).toBeUndefined()
    })

    test("DEFAULT_CROSS_ORIGIN_HEADERS is exported by electron-updater", ({ expect }) => {
      expect(UPDATER_DEFAULT_CROSS_ORIGIN_HEADERS).toBe(DEFAULT_CROSS_ORIGIN_HEADERS)
    })
  })

  // e.g. a custom provider written in plain JavaScript, or built on another copy of electron-updater: without its feed's origin, no other
  // origin can be told from it, so it gets no request header
  describe("the update provider's feedBaseUrl", () => {
    for (const [label, value] of [
      ["null", null],
      ["undefined", undefined],
      ["a string", "http://127.0.0.1/"],
    ] as const) {
      test(`of ${label} fails the check with ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED before the provider gets the request headers`, async ({ tmpDir, expect }) => {
        const { updater, feed, events } = await createUpdater(tmpDir)
        const handedOver: Array<OutgoingHttpHeaders | null> = []
        class PlainProvider extends GenericProvider {
          constructor(...args: ConstructorParameters<typeof GenericProvider>) {
            super(...args)
            Object.defineProperty(this, "feedBaseUrl", { value })
          }

          setRequestHeaders(headers: OutgoingHttpHeaders | null): void {
            handedOver.push(headers)
            super.setRequestHeaders(headers)
          }
        }
        updater.setFeedURL({ provider: "custom", updateProvider: PlainProvider, url: feed.url } as unknown as CustomPublishOptions)

        const error = await rejection(updater.checkForUpdates({ crossOriginHeaderAllowlist: useDefaults }))
        expect(error).toMatchObject({
          code: "ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED",
          message: expect.stringMatching(/^The feedBaseUrl of the update provider PlainProvider is /),
        })
        expect(handedOver).toEqual([])
        expect(feed.requests).toEqual([])
        expect(events).toEqual(["checking-for-update", "error"])
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

      await updater.checkForUpdates({ crossOriginHeaderAllowlist: first })
      await updater.downloadUpdate()
      expect(first.mock.calls.map(([, request]) => request.to.origin)).toEqual([channelHost.origin, cdn.origin])
      expect(cdn.requests[0].headers["x-tenant"]).toBe("acme")

      await updater.checkForUpdates({ crossOriginHeaderAllowlist: second })
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
      const crossOriginHeaderAllowlist = vi.fn(useDefaults)
      await updater.checkForUpdates({ crossOriginHeaderAllowlist })
      expect(crossOriginHeaderAllowlist).toHaveBeenCalledTimes(1)

      // the cached update does not match the latest update info: its marker is cleared, after the update info request
      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(pendingInstall.clearPendingInstallMarker).toHaveBeenCalled()
      expect(channelHost.requests).toHaveLength(2)
      expect(crossOriginHeaderAllowlist).toHaveBeenCalledTimes(2)
      expect(crossOriginHeaderAllowlist.mock.calls[1][1]).toMatchObject({ kind: "request", to: new URL(`${channelHost.url}/x.yml`) })
    })

    test("without a check, the install of an update marked for the next launch fails at its request to another origin", async ({ tmpDir, expect }) => {
      const { updater, channelHost, pendingInstall } = await createUpdaterWithPendingInstall(tmpDir)

      await expect(updater.installPendingUpdateIfAvailable()).rejects.toMatchObject({
        code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
        message: expect.stringMatching(
          new RegExp(
            `^The request to ${channelHost.origin} requires the updater's crossOriginHeaderAllowlist or a checkForUpdates\\(\\{ crossOriginHeaderAllowlist \\}\\) before it: `
          )
        ),
      })
      expect(channelHost.requests).toEqual([])
      expect(pendingInstall.clearPendingInstallMarker).not.toHaveBeenCalled()
    })
  })

  describe("the updater's crossOriginHeaderAllowlist property", () => {
    test("serves a check without the option", async ({ tmpDir, expect }) => {
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      const { updater } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)
      updater.crossOriginHeaderAllowlist = ["x-tenant"]

      expect((await updater.checkForUpdates())?.isUpdateAvailable).toBe(true)
      await updater.downloadUpdate()

      expect(cdn.requests).toHaveLength(1)
      expect(cdn.requests[0].headers["x-tenant"]).toBe("acme")
      expect(cdn.requests[0].headers.authorization).toBeUndefined()
    })

    test("serves checkForUpdatesAndNotify with only a notification", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)
      updater.crossOriginHeaderAllowlist = useDefaults

      expect((await updater.checkForUpdatesAndNotify({ notification: { title: "t", body: "b" } }))?.isUpdateAvailable).toBe(true)
      expect(feed.requests.map(it => it.pathname)).toEqual(["/latest.yml"])
    })

    test("is overridden by the option of a check", async ({ tmpDir, expect }) => {
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      const { updater } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)
      const property = vi.fn((defaults: ReadonlyArray<string>) => [...defaults, "x-tenant"])
      updater.crossOriginHeaderAllowlist = property

      await updater.checkForUpdates({ crossOriginHeaderAllowlist: useDefaults })
      await updater.downloadUpdate()

      expect(cdn.requests).toHaveLength(1)
      expect(cdn.requests[0].headers["x-tenant"]).toBeUndefined()
      expect(property).not.toHaveBeenCalled()
    })

    const invalid: ReadonlyArray<readonly [string, unknown, unknown]> = [
      ["a property that is a string", "accept", undefined],
      ["an option of null, with a valid property", useDefaults, { crossOriginHeaderAllowlist: null }],
    ]
    for (const [label, property, options] of invalid) {
      test(`${label} fails the check before any request`, async ({ tmpDir, expect }) => {
        const { updater, feed, events } = await createUpdater(tmpDir)
        Object.assign(updater, { crossOriginHeaderAllowlist: property })

        const error = await rejection(updater.checkForUpdates(options as CheckForUpdatesOptions | undefined))
        expect(error).toMatchObject({ code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED" })
        expect(feed.requests).toEqual([])
        expect(events).toEqual(["error"])
      })
    }

    // an update marked for the next launch, whose channel file on the feed redirects to another origin; the updater's executor asks the
    // updater for the headers of a redirect, as the ElectronHttpExecutor of an app does
    async function createUpdaterWithRedirectedPendingInstall(tmpDir: TmpDir) {
      const channelHost = await serve(tmpDir)
      await channelHost.write("latest.yml", channelYml(INSTALLER_NAME))
      const redirector = createServer((request, response) => {
        response.writeHead(302, { location: `${channelHost.url}${request.url ?? "/"}` })
        response.end()
      })
      servers.push(redirector)
      await new Promise<void>(resolve => redirector.listen(0, "127.0.0.1", resolve))
      const address = redirector.address()
      if (address == null || typeof address === "string") {
        throw new Error("the redirecting feed has no port")
      }
      const updater = await createNsisUpdater("1.0.0")
      updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: `http://127.0.0.1:${address.port}` })
      updater.autoDownload = false
      updater.requestHeaders = { "X-Tenant": "acme" }
      updater.addAuthHeader("Bearer s")
      const crossOriginHeadersFor = (updater as any).crossOriginHeadersFor.bind(updater) as CrossOriginHeadersCallback
      ;(updater as any).httpExecutor = new TestNodeHttpExecutor(crossOriginHeadersFor)
      const pendingInstall = { getPendingInstallInfo: vi.fn().mockResolvedValue({ sha512: "pending" }), clearPendingInstallMarker: vi.fn().mockResolvedValue(undefined) }
      vi.spyOn(updater as any, "getOrCreateDownloadHelper").mockResolvedValue(pendingInstall)
      return { updater, channelHost, pendingInstall }
    }

    test("serves the install at launch before any check, whose channel file redirects to another origin", async ({ tmpDir, expect }) => {
      const { updater, channelHost, pendingInstall } = await createUpdaterWithRedirectedPendingInstall(tmpDir)
      const property = vi.fn((defaults: ReadonlyArray<string>, _request: CrossOriginRequest) => [...defaults, "x-tenant"])
      updater.crossOriginHeaderAllowlist = property

      // the cached update does not match the latest update info: its marker is cleared, after the update info request
      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(pendingInstall.clearPendingInstallMarker).toHaveBeenCalled()
      expect(channelHost.requests.map(it => it.pathname)).toEqual(["/latest.yml"])
      expect(channelHost.requests[0].headers["x-tenant"]).toBe("acme")
      expect(channelHost.requests[0].headers.authorization).toBeUndefined()
      expect(property.mock.calls.map(([, request]) => [request.kind, request.to.origin])).toEqual([["redirect", channelHost.origin]])
    })

    test("without it, the install at launch before any check fails at the redirect to another origin", async ({ tmpDir, expect }) => {
      const { updater, channelHost, pendingInstall } = await createUpdaterWithRedirectedPendingInstall(tmpDir)

      await expect(updater.installPendingUpdateIfAvailable()).rejects.toMatchObject({
        code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
        message: expect.stringMatching(new RegExp(`^The redirect to ${channelHost.origin} requires the updater's crossOriginHeaderAllowlist or a checkForUpdates\\(`)),
      })
      expect(channelHost.requests).toEqual([])
      expect(pendingInstall.clearPendingInstallMarker).not.toHaveBeenCalled()
    })
  })
})
