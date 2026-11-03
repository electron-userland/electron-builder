import { serializeToYaml } from "builder-util"
import { type CustomPublishOptions } from "builder-util-runtime"
import type { CrossOriginHeadersCallback, CrossOriginHop } from "electron-updater"
import { GenericProvider } from "electron-updater/src/providers/GenericProvider"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type OutgoingHttpHeaders, type Server } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, test, vi } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, TestNodeHttpExecutor, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// autoUpdater.crossOriginHeaders decides the request headers of each request and redirect to another origin than the update provider's
// feedBaseUrl: it gets the lowercase names of the headers about to be sent and returns the ones to send. Required for every packaged app.

const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers"
const INSTALLER = Buffer.from("cross-origin headers test installer — not a real executable")
const INSTALLER_NAME = "app-1.1.0.exe"
const INSTALLER_SHA512 = createHash("sha512").update(INSTALLER).digest("base64")

describe("autoUpdater.crossOriginHeaders", () => {
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
      files: [{ url: installerUrl, sha512: INSTALLER_SHA512, size: INSTALLER.length }],
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

  // a server that redirects every request to `target`, on another origin
  async function redirectTo(target: string): Promise<string> {
    const redirector = createServer((request, response) => {
      response.writeHead(302, { location: `${target}${request.url ?? "/"}` })
      response.end()
    })
    servers.push(redirector)
    await new Promise<void>(resolve => redirector.listen(0, "127.0.0.1", resolve))
    const address = redirector.address()
    if (address == null || typeof address === "string") {
      throw new Error("the redirecting server has no port")
    }
    return `http://127.0.0.1:${address.port}`
  }

  describe("is required", () => {
    const notConfigured: ReadonlyArray<readonly [string, unknown]> = [
      ["null", null],
      ["a string", "accept"],
      ["an array", ["accept"]],
    ]
    // checkForUpdatesAndNotify is checkForUpdates, and a notification
    const calls: ReadonlyArray<readonly [string, string, (updater: Awaited<ReturnType<typeof createUpdater>>["updater"]) => Promise<unknown>]> = [
      ["checkForUpdates", "checkForUpdates", updater => updater.checkForUpdates()],
      ["checkForUpdatesAndNotify", "checkForUpdates", updater => updater.checkForUpdatesAndNotify()],
      ["downloadUpdate", "downloadUpdate", updater => updater.downloadUpdate()],
    ]
    for (const [method, subject, call] of calls) {
      for (const [label, value] of notConfigured) {
        test(`${method} with ${label} emits error and rejects before any request`, async ({ tmpDir, expect }) => {
          const { updater, feed, events } = await createUpdater(tmpDir)
          Object.assign(updater, { crossOriginHeaders: value })
          const doDownloadUpdate = vi.spyOn(updater as any, "doDownloadUpdate")
          const errors: Array<Error> = []
          updater.on("error", error => errors.push(error))

          const error = await rejection(call(updater))
          expect(error).toMatchObject({
            code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
            message:
              `${subject} requires autoUpdater.crossOriginHeaders, a function that gets the names of the request headers about to be sent to another origin than the update feed and returns the ones to send: ` +
              `set \`autoUpdater.crossOriginHeaders = () => []\` to send none of them. ${DOCS}`,
          })
          expect(feed.requests).toEqual([])
          expect(doDownloadUpdate).not.toHaveBeenCalled()
          expect(events).toEqual(["error"])
          expect(errors).toEqual([error])
        })
      }
    }

    // an app run unpackaged without forceDevUpdateConfig never checks, so it needs no configuration
    test("not by an unpackaged app, whose checkForUpdates resolves null", async ({ tmpDir, expect }) => {
      const { updater, feed, events } = await createUpdater(tmpDir)
      Object.defineProperty((updater as any).app, "isPackaged", { value: false })
      updater.crossOriginHeaders = null

      await expect(updater.checkForUpdates()).resolves.toBeNull()
      await expect(updater.checkForUpdatesAndNotify()).resolves.toBeNull()
      expect(feed.requests).toEqual([])
      expect(events).toEqual([])
    })

    test("checkForUpdatesAndNotify takes its notification as before", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)

      expect((await updater.checkForUpdatesAndNotify({ title: "t", body: "b" }))?.isUpdateAvailable).toBe(true)
      expect(feed.requests.map(it => it.pathname)).toEqual(["/latest.yml"])
    })
  })

  describe("is called for each request to another origin", () => {
    test("not for the feed's origin, which gets every header", async ({ tmpDir, expect }) => {
      const { updater, feed } = await createUpdater(tmpDir)
      const crossOriginHeaders = vi.fn(() => [])
      updater.crossOriginHeaders = crossOriginHeaders

      await updater.checkForUpdates()
      await updater.downloadUpdate()

      expect(crossOriginHeaders).not.toHaveBeenCalled()
      expect(feed.requests.map(it => it.pathname)).toEqual(["/latest.yml", `/${INSTALLER_NAME}`])
      for (const { headers } of feed.requests) {
        expect(headers).toMatchObject({ authorization: "Bearer s", "x-tenant": "acme" })
      }
    })

    test("a download on another origin: the lowercase header names and the hop, with autoDownload", async ({ tmpDir, expect }) => {
      const cdn = await serve(tmpDir)
      await cdn.write(INSTALLER_NAME, INSTALLER)
      const { updater, feed, events } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)
      updater.autoDownload = true
      updater.requestHeaders = { ...updater.requestHeaders, "User-Agent": "my-app" }
      const crossOriginHeaders = vi.fn((headerNames: string[], _hop: CrossOriginHop) => headerNames.filter(it => it === "x-tenant"))
      updater.crossOriginHeaders = crossOriginHeaders

      const { updateFile } = (await (await updater.checkForUpdates())!.downloadPromise)!
      expect(await fsExtra.readFile(updateFile)).toEqual(INSTALLER)
      expect(events).not.toContain("error")

      expect(crossOriginHeaders).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining(["accept", "authorization", "x-tenant", "user-agent"]), {
        from: new URL(`${feed.url}/`),
        to: new URL(`${cdn.url}/${INSTALLER_NAME}`),
      })
      const headerNames = crossOriginHeaders.mock.calls[0][0]
      expect(headerNames).toEqual(headerNames.map(it => it.toLowerCase()))
      expect(cdn.requests).toHaveLength(1)
      // the updater's own Accept and User-Agent are sent whatever crossOriginHeaders returns; the app's User-Agent is not
      expect(cdn.requests[0].headers).toMatchObject({ "x-tenant": "acme", accept: "*/*", "user-agent": "electron-builder" })
      expect(cdn.requests[0].headers.authorization).toBeUndefined()
    })

    test("a channel file on another origin, read again at each request", async ({ tmpDir, expect }) => {
      const channelHost = await serve(tmpDir)
      await channelHost.write("x.yml", channelYml(INSTALLER_NAME))
      const { updater } = await createUpdater(tmpDir)
      updater.channel = `${channelHost.url}/x`
      updater.requestHeaders = { ...updater.requestHeaders, "Accept-Language": "de" }

      updater.crossOriginHeaders = () => ["Accept-Language"]
      await updater.checkForUpdates()
      expect(channelHost.requests).toHaveLength(1)
      expect(channelHost.requests[0].headers["accept-language"]).toBe("de")
      expect(channelHost.requests[0].headers["x-tenant"]).toBeUndefined()
      expect(channelHost.requests[0].headers.authorization).toBeUndefined()

      updater.crossOriginHeaders = () => ["x-tenant"]
      await updater.checkForUpdates()
      expect(channelHost.requests).toHaveLength(2)
      expect(channelHost.requests[1].headers["x-tenant"]).toBe("acme")
      expect(channelHost.requests[1].headers["accept-language"]).toBeUndefined()
    })

    // a provider's own headers for a request (a token, an Accept) go through it on another origin too, its Accept excepted
    test("the provider's own request headers on another origin", async ({ tmpDir, expect }) => {
      const channelHost = await serve(tmpDir)
      await channelHost.write("latest.yml", channelYml(INSTALLER_NAME))
      const { updater, feed } = await createUpdater(tmpDir)
      class TokenProvider extends GenericProvider {
        async getLatestVersion() {
          const url = new URL(`${channelHost.url}/latest.yml`)
          await this.channelFileRequest(url, { authorization: "token provider-secret", Accept: "application/x-yaml" })
          return { version: "1.0.0", files: [], path: "", sha512: "", releaseDate: "2024-01-01T00:00:00.000Z" }
        }
      }
      updater.setFeedURL({ provider: "custom", updateProvider: TokenProvider, url: feed.url } as unknown as CustomPublishOptions)

      updater.crossOriginHeaders = () => []
      await updater.checkForUpdates()
      expect(channelHost.requests).toHaveLength(1)
      expect(channelHost.requests[0].headers.authorization).toBeUndefined()
      expect(channelHost.requests[0].headers.accept).toBe("application/x-yaml")

      updater.crossOriginHeaders = headerNames => headerNames.filter(it => it === "authorization")
      await updater.checkForUpdates()
      expect(channelHost.requests[1].headers.authorization).toBe("token provider-secret")
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
      ["returns null", () => null],
      ["returns an array with a number", () => [1, "accept"]],
    ] as const) {
      test(`that ${label} fails that request with ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS, not the others`, async ({ tmpDir, expect }) => {
        const cdn = await serve(tmpDir)
        await cdn.write(INSTALLER_NAME, INSTALLER)
        const { updater, feed } = await createUpdater(tmpDir, () => `${cdn.url}/${INSTALLER_NAME}`)
        updater.crossOriginHeaders = crossOriginHeaders as unknown as CrossOriginHeadersCallback

        // the channel file is on the feed's origin: the check runs
        expect((await updater.checkForUpdates())!.isUpdateAvailable).toBe(true)
        expect(feed.requests).toHaveLength(1)

        const error = await rejection(updater.downloadUpdate())
        expect(error).toMatchObject({ code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS", message: expect.stringContaining(`the request from ${feed.origin} to ${cdn.origin}`) })
        expect(String((error as Error).message)).not.toContain("value-secret")
        expect(String((error as Error).message)).toContain(DOCS)
        expect(cdn.requests).toEqual([])
      })
    }
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

        const error = await rejection(updater.checkForUpdates())
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

  // the install at launch of an update marked for the next launch fetches the update info again first, through the updater's executor,
  // which asks the updater's policy about a redirect as the ElectronHttpExecutor of an app does: here the feed's channel file redirects
  // to another origin
  describe("serves the install at launch", () => {
    async function createUpdaterWithRedirectedPendingInstall(tmpDir: TmpDir) {
      const channelHost = await serve(tmpDir)
      await channelHost.write("latest.yml", channelYml(INSTALLER_NAME))
      const feedUrl = await redirectTo(channelHost.url)
      const updater = await createNsisUpdater("1.0.0")
      updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: feedUrl })
      updater.autoDownload = false
      updater.requestHeaders = { "X-Tenant": "acme" }
      updater.addAuthHeader("Bearer s")
      ;(updater as any).httpExecutor = new TestNodeHttpExecutor((updater as any).crossOriginHeaderPolicy)
      const installerPath = path.join(await tmpDir.createTempDir({ prefix: "cross-origin-headers-pending" }), INSTALLER_NAME)
      await fsExtra.writeFile(installerPath, INSTALLER)
      const pendingInstall = {
        packageFile: null,
        getPendingInstallInfo: vi.fn().mockResolvedValue({ sha512: INSTALLER_SHA512 }),
        validateCachedPendingInstall: vi.fn().mockResolvedValue(installerPath),
        clearPendingInstallMarker: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      }
      vi.spyOn(updater as any, "getOrCreateDownloadHelper").mockResolvedValue(pendingInstall)
      vi.spyOn(updater as any, "verifyInstallerSignatureOnLaunch").mockResolvedValue({ response: "success" })
      const install = vi.spyOn(updater as any, "runInstallAsync").mockResolvedValue(true)
      return { updater, channelHost, pendingInstall, install }
    }

    test("whose channel file redirects to another origin: it installs with the property set", async ({ tmpDir, expect }) => {
      const { updater, channelHost, pendingInstall, install } = await createUpdaterWithRedirectedPendingInstall(tmpDir)
      const crossOriginHeaders = vi.fn((headerNames: string[], _hop: CrossOriginHop) => headerNames.filter(it => it === "x-tenant"))
      updater.crossOriginHeaders = crossOriginHeaders

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(true)
      expect(install).toHaveBeenCalledTimes(1)
      expect(pendingInstall.clearPendingInstallMarker).toHaveBeenCalled()
      expect(channelHost.requests.map(it => it.pathname)).toEqual(["/latest.yml"])
      expect(channelHost.requests[0].headers["x-tenant"]).toBe("acme")
      expect(channelHost.requests[0].headers.authorization).toBeUndefined()
      expect(crossOriginHeaders.mock.calls.map(([, hop]) => hop.to.origin)).toEqual([channelHost.origin])
    })

    test("whose channel file redirects to another origin: without the property it fails at the redirect, not installed", async ({ tmpDir, expect }) => {
      const { updater, channelHost, pendingInstall, install } = await createUpdaterWithRedirectedPendingInstall(tmpDir)
      updater.crossOriginHeaders = null

      await expect(updater.installPendingUpdateIfAvailable()).rejects.toMatchObject({
        code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
        message: expect.stringMatching(
          new RegExp(`^The request to ${channelHost.origin}, another origin than http://127\\.0\\.0\\.1:\\d+, requires autoUpdater\\.crossOriginHeaders`)
        ),
      })
      expect(channelHost.requests).toEqual([])
      expect(pendingInstall.clearPendingInstallMarker).not.toHaveBeenCalled()
      expect(install).not.toHaveBeenCalled()
    })
  })
})
