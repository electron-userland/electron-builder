import {
  CancellationToken,
  type CrossOriginHeadersCallback,
  type CrossOriginRequest,
  DEFAULT_CROSS_ORIGIN_HEADERS,
  DownloadOptions,
  GenericServerOptions,
  GithubOptions,
  PublishConfiguration,
  UpdateInfo,
} from "builder-util-runtime"
import { serializeToYaml } from "builder-util"
import { AppImageUpdater, AppUpdater } from "electron-updater"
import type { DownloadUpdateOptions } from "electron-updater/src/AppUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "electron-updater/src/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { createClient } from "electron-updater/src/providerFactory"
import { Provider, resolveFiles } from "electron-updater/src/providers/Provider"
import type { ResolvedUpdateFileInfo } from "electron-updater/src/types"
import { NsisUpdater } from "electron-updater/src/NsisUpdater"
import { createHash } from "crypto"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, RequestOptions, Server } from "http"
import Module from "node:module"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, test, vi } from "vitest"
import { gzipSync } from "zlib"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, createTestAppAdapter, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// The app's request headers (requestHeaders / addAuthHeader) other than its crossOriginHeaders, and the feed URL's query, are only sent to
// download URLs on the feed's origin.

const sha512 = (data: Buffer) => createHash("sha512").update(data).digest("base64")

describe("download URLs chosen by the update manifest", () => {
  const INSTALLER_NAME = "TestApp-Setup-1.1.0.exe"
  const INSTALLER = Buffer.from("manifest download origin test installer — not a real executable")
  const PACKAGE_NAME = "TestApp-1.1.0.nsis.7z"
  const PACKAGE = Buffer.from("manifest download origin test web package — not a real 7z archive")

  const servers: Array<Server> = []
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close()
    }
  })

  // a local static server that records every request; two servers on different ports are different origins
  async function serve(tmpDir: TmpDir) {
    const root = await tmpDir.getTempDir({ prefix: "manifest-origin-server" })
    const { server, port } = await createLocalServer(root)
    servers.push(server)
    const requests: Array<{ pathname: string; search: string; headers: IncomingHttpHeaders }> = []
    server.on("request", (request: IncomingMessage) => {
      const url = new URL(request.url!, "http://localhost")
      requests.push({ pathname: url.pathname, search: url.search, headers: request.headers })
    })
    return { url: `http://127.0.0.1:${port}`, requests, write: (name: string, content: string | Buffer) => fsExtra.outputFile(path.join(root, name), content) }
  }

  function channelYml(installerUrl: string, packages?: object) {
    return serializeToYaml({
      version: "1.1.0",
      files: [{ url: installerUrl, sha512: sha512(INSTALLER), size: INSTALLER.length }],
      releaseDate: "2024-01-01T00:00:00.000Z",
      ...(packages == null ? {} : { packages }),
    })
  }

  async function createUpdater(feedUrl: string) {
    const updater = await createNsisUpdater("1.0.0")
    // a publisherName, so the (stubbed) Authenticode check runs
    updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: `${feedUrl}/?token=feed-secret`, publisherName: ["CN=Test"] })
    updater.verifyUpdateFileAuthenticodeSignature = () => Promise.resolve({ response: "success" })
    updater.requestHeaders = { "X-Tenant": "acme" }
    updater.addAuthHeader("Bearer feed-secret")
    return updater
  }

  test("a download on another origin gets no credential headers or feed query", async ({ tmpDir, expect }) => {
    const feed = await serve(tmpDir)
    const foreign = await serve(tmpDir)
    await feed.write("latest.yml", channelYml(`${foreign.url}/${INSTALLER_NAME}`))
    await foreign.write(INSTALLER_NAME, INSTALLER)
    const updater = await createUpdater(feed.url)
    const events = trackEvents(updater)

    const { updateFile } = (await (await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))!.downloadPromise)!
    expect(await fsExtra.readFile(updateFile)).toEqual(INSTALLER)
    expect(events).not.toContain("error")

    // positive control: the feed request carries the configured credentials
    expect(feed.requests).toHaveLength(1)
    expect(feed.requests[0]).toMatchObject({ pathname: "/latest.yml", search: "?token=feed-secret" })
    expect(feed.requests[0].headers).toMatchObject({ authorization: "Bearer feed-secret", "x-tenant": "acme" })

    expect(foreign.requests).toHaveLength(1)
    expect(foreign.requests[0]).toMatchObject({ pathname: `/${INSTALLER_NAME}`, search: "" })
    expect(foreign.requests[0].headers.authorization).toBeUndefined()
    expect(foreign.requests[0].headers).toMatchObject({ accept: "*/*", "user-agent": "electron-builder" })
  })

  test("a download and a channel file on another origin get the headers crossOriginHeaders lists, every header for null", async ({ tmpDir, expect }) => {
    const feed = await serve(tmpDir)
    const foreign = await serve(tmpDir)
    await foreign.write("x.yml", channelYml(`${foreign.url}/${INSTALLER_NAME}`))
    await foreign.write(INSTALLER_NAME, INSTALLER)
    const updater = await createUpdater(feed.url)
    updater.channel = `${foreign.url}/x`

    await (await updater.checkForUpdates({ crossOriginHeaders: defaults => [...defaults, "x-tenant"] }))!.downloadPromise
    expect(foreign.requests.map(it => it.pathname)).toEqual(["/x.yml", `/${INSTALLER_NAME}`])
    for (const { headers } of foreign.requests) {
      expect(headers).toMatchObject({ "x-tenant": "acme" })
      expect(headers.authorization).toBeUndefined()
    }

    // the update is downloaded already: the channel file shows the headers
    updater.autoDownload = false
    await updater.checkForUpdates({ crossOriginHeaders: () => null })
    expect(foreign.requests).toHaveLength(3)
    expect(foreign.requests[2].headers).toMatchObject({ "x-tenant": "acme", authorization: "Bearer feed-secret" })
  })

  test("the web package on another origin gets no credentials; the same-origin installer keeps them", async ({ tmpDir, expect }) => {
    const feed = await serve(tmpDir)
    const foreign = await serve(tmpDir)
    await feed.write("latest.yml", channelYml(INSTALLER_NAME, { [process.arch]: { path: `${foreign.url}/${PACKAGE_NAME}`, sha512: sha512(PACKAGE), size: PACKAGE.length } }))
    await feed.write(INSTALLER_NAME, INSTALLER)
    await foreign.write(PACKAGE_NAME, PACKAGE)
    const updater = await createUpdater(feed.url)
    updater.disableWebInstaller = false
    const events = trackEvents(updater)

    const { packageFile } = (await (await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))!.downloadPromise)!
    expect(await fsExtra.readFile(packageFile!)).toEqual(PACKAGE)
    expect(events).not.toContain("error")

    const installerRequests = feed.requests.filter(it => it.pathname === `/${INSTALLER_NAME}`)
    expect(installerRequests).toHaveLength(1)
    expect(installerRequests[0].search).toBe("?token=feed-secret")
    expect(installerRequests[0].headers).toMatchObject({ authorization: "Bearer feed-secret" })

    expect(foreign.requests).toHaveLength(1)
    expect(foreign.requests[0]).toMatchObject({ pathname: `/${PACKAGE_NAME}`, search: "" })
    expect(foreign.requests[0].headers.authorization).toBeUndefined()
    expect(foreign.requests[0].headers).toMatchObject({ accept: "*/*", "user-agent": "electron-builder" })
  })

  test("a channel file on another origin gets only the allowlisted headers and no feed query; a channel on the feed keeps them", async ({ tmpDir, expect }) => {
    const feed = await serve(tmpDir)
    const foreign = await serve(tmpDir)
    await feed.write("beta.yml", channelYml(INSTALLER_NAME))
    await foreign.write("x.yml", channelYml(INSTALLER_NAME))
    const updater = await createUpdater(feed.url)
    updater.autoDownload = false
    updater.requestHeaders = { ...updater.requestHeaders, "Accept-Language": "de" }

    updater.channel = "beta"
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))!.isUpdateAvailable).toBe(true)
    expect(feed.requests).toHaveLength(1)
    expect(feed.requests[0]).toMatchObject({ pathname: "/beta.yml", search: "?token=feed-secret" })
    expect(feed.requests[0].headers).toMatchObject({ authorization: "Bearer feed-secret", "x-tenant": "acme" })

    // a channel name that is a URL resolves against the feed URL to another origin
    updater.channel = `${foreign.url}/x`
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))!.isUpdateAvailable).toBe(true)
    expect(feed.requests).toHaveLength(1)
    expect(foreign.requests).toHaveLength(1)
    expect(foreign.requests[0]).toMatchObject({ pathname: "/x.yml", search: "" })
    // the cross-origin allowlist, as on a redirect or a download: a custom header such as X-Tenant stays on the feed origin too
    expect(foreign.requests[0].headers.authorization).toBeUndefined()
    expect(foreign.requests[0].headers["x-tenant"]).toBeUndefined()
    expect(foreign.requests[0].headers).toMatchObject({ "accept-language": "de" })
  })

  // electron-updater adds x-user-staging-id to update info requests itself: like the app's headers, it goes to another origin only when listed
  test("a channel file on another origin gets the staging id only when crossOriginHeaders lists it", async ({ tmpDir, expect }) => {
    const feed = await serve(tmpDir)
    const foreign = await serve(tmpDir)
    await feed.write("beta.yml", channelYml(INSTALLER_NAME))
    await foreign.write("x.yml", channelYml(INSTALLER_NAME))
    const updater = await createNsisUpdater("1.0.0")
    updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: feed.url })
    updater.autoDownload = false

    updater.channel = "beta"
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))!.isUpdateAvailable).toBe(true)
    expect(feed.requests[0].headers["x-user-staging-id"]).toEqual(expect.any(String))

    updater.channel = `${foreign.url}/x`
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))!.isUpdateAvailable).toBe(true)
    expect(foreign.requests).toHaveLength(1)
    expect(foreign.requests[0].headers["x-user-staging-id"]).toBeUndefined()

    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => [...defaults, "x-user-staging-id"] }))!.isUpdateAvailable).toBe(true)
    expect(foreign.requests).toHaveLength(2)
    expect(foreign.requests[1].headers["x-user-staging-id"]).toBe(feed.requests[0].headers["x-user-staging-id"])
  })
})

// The differential paths swallow errors (or fall back to a full download), so each test asserts that the spied request
// was made before checking its headers.
describe("differential downloads use the per-download headers", () => {
  const FEED_URL = "https://feed.example.com/updates/?token=s"

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function setUpUpdater<T extends AppUpdater>(updater: T, tmpDir: TmpDir): Promise<T> {
    tuneTestUpdater(updater, { platform: "win32", isUseDifferentialDownload: true })
    updater.requestHeaders = { "X-Tenant": "acme" }
    updater.addAuthHeader("Bearer s")
    // the crossOriginHeaders a checkForUpdates({ crossOriginHeaders: defaults => defaults }) keeps for the download
    ;(updater as any).checkCrossOriginHeaders = (defaults: ReadonlyArray<string>) => defaults
    ;(updater as any).downloadedUpdateHelper = new DownloadedUpdateHelper(await tmpDir.getTempDir({ prefix: "manifest-origin-cache" }), updater.log)
    return updater
  }

  function createProvider(updater: AppUpdater, options: PublishConfiguration): Provider<any> {
    return createClient(options, updater, { isUseMultipleRangeRequest: false, platform: "win32", executor: {} as any })
  }

  function updateInfo(fileUrl: string, extra: object = {}): UpdateInfo {
    return { version: "1.1.0", files: [{ url: fileUrl, sha512: "x", size: 10 }], releaseDate: "2024-01-01T00:00:00.000Z", ...extra }
  }

  // the headers the updater computes for a real download (accept, requestHeaders, addAuthHeader)
  function downloadUpdateOptions(updater: AppUpdater, provider: Provider<any>, info: UpdateInfo): DownloadUpdateOptions {
    return { updateInfoAndProvider: { info, provider }, requestHeaders: (updater as any).computeRequestHeaders(provider), cancellationToken: new CancellationToken() }
  }

  function captureBlockMapRequests(updater: AppUpdater) {
    const requests: Array<{ url: string; headers: OutgoingHttpHeaders }> = []
    ;(updater as any).httpExecutor = {
      downloadToBuffer: (url: URL, options: DownloadOptions) => {
        requests.push({ url: url.href, headers: options.headers! })
        return Promise.resolve(gzipSync(JSON.stringify({ version: "2", files: [] })))
      },
    }
    return requests
  }

  function captureRangeRequestHeaders(downloaderClass: typeof GenericDifferentialDownloader | typeof FileWithEmbeddedBlockMapDifferentialDownloader) {
    const captured: Array<OutgoingHttpHeaders | null> = []
    vi.spyOn(downloaderClass.prototype, "download").mockImplementation(function (this: GenericDifferentialDownloader) {
      captured.push(this.options.requestHeaders)
      return Promise.resolve()
    })
    return captured
  }

  async function differentialDownloadInstaller(updater: AppUpdater, provider: Provider<any>, info: UpdateInfo, tmpDir: TmpDir) {
    const fileInfo = provider.resolveFiles(info)[0]
    const installerPath = path.join(await tmpDir.getTempDir({ prefix: "manifest-origin-installer" }), "installer.exe")
    return (updater as any).differentialDownloadInstaller(fileInfo, downloadUpdateOptions(updater, provider, info), installerPath, provider, "installer.exe")
  }

  // another host, and the feed's host over plain http
  test.for(["https://cdn.example.net/", "http://feed.example.com/updates/"])(
    "blockmaps and range requests of a file on another origin (%s) get no credentials or feed query",
    async (base, { tmpDir, expect }) => {
      const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
      const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
      const blockMapRequests = captureBlockMapRequests(updater)
      const rangeRequestHeaders = captureRangeRequestHeaders(GenericDifferentialDownloader)

      await expect(differentialDownloadInstaller(updater, provider, updateInfo(`${base}app-1.1.0.exe`), tmpDir)).resolves.toBe(false)

      expect(blockMapRequests.map(it => it.url)).toEqual([`${base}app-1.1.0.exe.blockmap`, `${base}app-1.0.0.exe.blockmap`])
      expect(rangeRequestHeaders).toHaveLength(1)
      for (const headers of [...blockMapRequests.map(it => it.headers), rangeRequestHeaders[0]]) {
        expect(headers).not.toHaveProperty("authorization")
        expect(headers).toHaveProperty("accept", "*/*")
      }
    }
  )

  test("same-origin blockmaps and range requests keep credentials and feed query", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const blockMapRequests = captureBlockMapRequests(updater)
    const rangeRequestHeaders = captureRangeRequestHeaders(GenericDifferentialDownloader)

    await expect(differentialDownloadInstaller(updater, provider, updateInfo("app-1.1.0.exe"), tmpDir)).resolves.toBe(false)

    expect(blockMapRequests.map(it => it.url)).toEqual([
      "https://feed.example.com/updates/app-1.1.0.exe.blockmap?token=s",
      "https://feed.example.com/updates/app-1.0.0.exe.blockmap?token=s",
    ])
    expect(rangeRequestHeaders).toHaveLength(1)
    for (const headers of [...blockMapRequests.map(it => it.headers), rangeRequestHeaders[0]]) {
      expect(headers).toHaveProperty("authorization", "Bearer s")
    }
  })

  // `..//host/…` yields a same-origin file URL whose pathname starts with `//`; the blockmap URL derived from it is on `host`
  test.for([
    { name: "generic", options: { provider: "generic", url: FEED_URL } as GenericServerOptions, fileUrl: "..//cdn.example.net/app-1.1.0.exe", extra: {}, override: null },
    {
      name: "github",
      options: { provider: "github", owner: "owner", repo: "repo" } as GithubOptions,
      fileUrl: "../../../../..//cdn.example.net/app-1.1.0.exe",
      extra: { tag: "v1.1.0" },
      override: null,
    },
    // the old blockmap URL resolves against the override, and to another host the same way
    {
      name: "generic with previousBlockmapBaseUrlOverride",
      options: { provider: "generic", url: FEED_URL } as GenericServerOptions,
      fileUrl: "..//cdn.example.net/app-1.1.0.exe",
      extra: {},
      override: "https://blockmaps.example.org/old/",
    },
  ])("$name: blockmaps derived from a same-origin file URL that resolve to another host get no credentials", async ({ options, fileUrl, extra, override }, { tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    updater.previousBlockmapBaseUrlOverride = override
    const provider = createProvider(updater, options)
    const info = updateInfo(fileUrl, extra)
    expect(provider.resolveFiles(info)[0].url.origin).toBe(provider.feedBaseUrl!.origin)
    const blockMapRequests = captureBlockMapRequests(updater)
    const rangeRequestHeaders = captureRangeRequestHeaders(GenericDifferentialDownloader)

    await expect(differentialDownloadInstaller(updater, provider, info, tmpDir)).resolves.toBe(false)

    expect(blockMapRequests.map(it => it.url)).toEqual(["https://cdn.example.net/app-1.1.0.exe.blockmap", "https://cdn.example.net/app-1.0.0.exe.blockmap"])
    for (const { headers } of blockMapRequests) {
      expect(headers).not.toHaveProperty("authorization")
      expect(headers).toHaveProperty("accept", "*/*")
    }
    // the range requests go to the file URL itself, which is on the feed origin
    expect(rangeRequestHeaders).toHaveLength(1)
    expect(rangeRequestHeaders[0]).toHaveProperty("authorization", "Bearer s")
  })

  test("the old blockmap from an app-set previousBlockmapBaseUrlOverride keeps credentials", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    updater.previousBlockmapBaseUrlOverride = "https://blockmaps.example.org/old/"
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const blockMapRequests = captureBlockMapRequests(updater)
    captureRangeRequestHeaders(GenericDifferentialDownloader)

    await expect(differentialDownloadInstaller(updater, provider, updateInfo("app-1.1.0.exe"), tmpDir)).resolves.toBe(false)

    // the new blockmap is still compared against the feed
    expect(blockMapRequests.map(it => it.url)).toEqual([
      "https://feed.example.com/updates/app-1.1.0.exe.blockmap?token=s",
      "https://blockmaps.example.org/updates/app-1.0.0.exe.blockmap",
    ])
    for (const { headers } of blockMapRequests) {
      expect(headers).toHaveProperty("authorization", "Bearer s")
    }
  })

  test("the NSIS web-package differential download strips credentials for another origin", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const rangeRequestHeaders = captureRangeRequestHeaders(FileWithEmbeddedBlockMapDifferentialDownloader)
    const options = downloadUpdateOptions(updater, provider, updateInfo("app-1.1.0.exe"))
    const packagePath = path.join(await tmpDir.getTempDir({ prefix: "manifest-origin-package" }), "package.7z")
    const differentialDownloadWebPackage = (packageUrl: string): Promise<boolean> =>
      (updater as any).differentialDownloadWebPackage(options, { path: packageUrl, sha512: "x", size: 10, blockMapSize: 4 }, packagePath, provider)

    await expect(differentialDownloadWebPackage("https://cdn.example.net/app-1.1.0.nsis.7z")).resolves.toBe(false)
    await expect(differentialDownloadWebPackage("https://feed.example.com/updates/app-1.1.0.nsis.7z")).resolves.toBe(false)

    expect(rangeRequestHeaders).toHaveLength(2)
    expect(rangeRequestHeaders[0]).not.toHaveProperty("authorization")
    // `accept` is only in the per-download headers, not in the raw app request headers
    expect(rangeRequestHeaders[0]).toHaveProperty("accept", "*/*")
    expect(rangeRequestHeaders[1]).toHaveProperty("authorization", "Bearer s")
  })

  test("the AppImage differential download strips credentials for another origin", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(new AppImageUpdater(null, await createTestAppAdapter("1.0.0")), tmpDir)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const rangeRequestHeaders = captureRangeRequestHeaders(FileWithEmbeddedBlockMapDifferentialDownloader)
    const info = updateInfo("https://cdn.example.net/app-1.1.0.AppImage")
    const updateFile = path.join(await tmpDir.getTempDir({ prefix: "manifest-origin-appimage" }), "app.AppImage")

    await expect(
      (updater as any).downloadDifferential(provider.resolveFiles(info)[0], "/old/app.AppImage", updateFile, provider, downloadUpdateOptions(updater, provider, info))
    ).resolves.toBe(false)

    expect(rangeRequestHeaders).toHaveLength(1)
    expect(rangeRequestHeaders[0]).not.toHaveProperty("authorization")
    expect(rangeRequestHeaders[0]).toHaveProperty("accept", "*/*")
  })

  // no feed URL: its crossOriginHeaders sends every header to the GitHub API only
  test("private GitHub: the request headers go to the API's asset URLs, only the default list elsewhere", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "github", owner: "owner", repo: "repo", token: "t" } as GithubOptions)
    const options = downloadUpdateOptions(updater, provider, updateInfo("app-1.1.0.exe"))
    const headersFor = (url: string): OutgoingHttpHeaders => (updater as any).downloadRequestHeaders(new URL(url), options)

    expect(provider.feedBaseUrl).toBeNull()
    expect(headersFor("https://api.github.com/repos/owner/repo/releases/assets/1")).toEqual(options.requestHeaders)
    expect(options.requestHeaders).toMatchObject({ authorization: "Bearer s", "X-Tenant": "acme" })
    expect(headersFor("https://objects.example.net/app-1.1.0.exe")).toEqual({ accept: "application/octet-stream" })
  })

  // ── blockMapUrl: the update manifest names the file's blockmap (e.g. separately pre-signed) ──

  test("resolveFiles: a relative blockMapUrl resolves against the feed (feed query), an absolute one keeps only its own query", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const resolve = (blockMapUrl: string | undefined) =>
      provider.resolveFiles({ ...updateInfo("https://cdn.example.net/app-1.1.0.exe?X-Amz-Signature=installer"), files: [{ url: "app-1.1.0.exe", sha512: "x", blockMapUrl }] })[0]

    expect(resolve("maps/app-1.1.0.exe.blockmap").blockMapUrl?.href).toBe("https://feed.example.com/updates/maps/app-1.1.0.exe.blockmap?token=s")
    expect(resolve("https://cdn.example.net/app-1.1.0.exe.blockmap?X-Amz-Signature=blockmap").blockMapUrl?.href).toBe(
      "https://cdn.example.net/app-1.1.0.exe.blockmap?X-Amz-Signature=blockmap"
    )
    expect(resolve(undefined)).not.toHaveProperty("blockMapUrl")
  })

  test("resolveFiles: GitHub resolves a relative blockMapUrl to the release download like the file url", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "github", owner: "owner", repo: "repo" } as GithubOptions)
    const [resolved] = provider.resolveFiles(updateInfo("app 1.1.0.exe", { tag: "v1.1.0", files: [{ url: "app 1.1.0.exe", sha512: "x", blockMapUrl: "app 1.1.0.exe.blockmap" }] }))

    expect(resolved.url.href).toBe("https://github.com/owner/repo/releases/download/v1.1.0/app-1.1.0.exe")
    expect(resolved.blockMapUrl?.href).toBe("https://github.com/owner/repo/releases/download/v1.1.0/app-1.1.0.exe.blockmap")
  })

  test("resolveFiles: GitHub keeps an absolute blockMapUrl as-is, with its own host and query", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "github", owner: "owner", repo: "repo" } as GithubOptions)
    const blockMapUrl = "https://cdn.example.net/app%201.1.0.exe.blockmap?X-Amz-Signature=blockmap&X-Amz-Expires=600"
    const [resolved] = provider.resolveFiles(updateInfo("app 1.1.0.exe", { tag: "v1.1.0", files: [{ url: "app 1.1.0.exe", sha512: "x", blockMapUrl }] }))

    expect(resolved.url.href).toBe("https://github.com/owner/repo/releases/download/v1.1.0/app-1.1.0.exe")
    expect(resolved.blockMapUrl?.href).toBe(blockMapUrl)
  })

  async function writeCachedOldBlockMap(updater: AppUpdater) {
    const cacheDir = (updater as any).downloadedUpdateHelper.cacheDir
    await fsExtra.outputFile(path.join(cacheDir, "current.blockmap"), gzipSync(JSON.stringify({ version: "2", files: [] })))
  }

  const PRE_SIGNED = {
    url: "https://cdn.example.net/app-1.1.0.exe?X-Amz-Signature=installer",
    blockMapUrl: "https://cdn.example.net/app-1.1.0.exe.blockmap?X-Amz-Signature=blockmap",
  }

  test("blockMapUrl is used for the new blockmap; the old one comes from the cache", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    await writeCachedOldBlockMap(updater)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const blockMapRequests = captureBlockMapRequests(updater)
    const rangeRequestHeaders = captureRangeRequestHeaders(GenericDifferentialDownloader)
    const info = { ...updateInfo(""), files: [{ ...PRE_SIGNED, sha512: "x", size: 10 }] }

    await expect(differentialDownloadInstaller(updater, provider, info, tmpDir)).resolves.toBe(false)

    // the installer's signature is not reused on a derived blockmap URL, and the other origin gets no credentials
    expect(blockMapRequests.map(it => it.url)).toEqual([PRE_SIGNED.blockMapUrl])
    expect(blockMapRequests[0].headers).not.toHaveProperty("authorization")
    expect(rangeRequestHeaders).toHaveLength(1)
  })

  test("a same-origin blockMapUrl keeps the credentials", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    await writeCachedOldBlockMap(updater)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const blockMapRequests = captureBlockMapRequests(updater)
    captureRangeRequestHeaders(GenericDifferentialDownloader)
    const info = { ...updateInfo(""), files: [{ url: "app-1.1.0.exe", blockMapUrl: "maps/app-1.1.0.exe.blockmap", sha512: "x", size: 10 }] }

    await expect(differentialDownloadInstaller(updater, provider, info, tmpDir)).resolves.toBe(false)

    expect(blockMapRequests.map(it => it.url)).toEqual(["https://feed.example.com/updates/maps/app-1.1.0.exe.blockmap?token=s"])
    expect(blockMapRequests[0].headers).toHaveProperty("authorization", "Bearer s")
  })

  test("blockMapUrl without a cached old blockmap: no derived old URL, a full download that caches the new blockmap", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const blockMapRequests = captureBlockMapRequests(updater)
    const rangeRequestHeaders = captureRangeRequestHeaders(GenericDifferentialDownloader)
    const info = { ...updateInfo(""), files: [{ ...PRE_SIGNED, sha512: "x", size: 10 }] }

    // true: fall back to the full download
    await expect(differentialDownloadInstaller(updater, provider, info, tmpDir)).resolves.toBe(true)

    expect(blockMapRequests.map(it => it.url)).toEqual([PRE_SIGNED.blockMapUrl])
    expect(rangeRequestHeaders).toHaveLength(0)
    // promoted to the cache when the full download is done, for the next update
    const pendingDir = (updater as any).downloadedUpdateHelper.cacheDirForPendingUpdate
    expect(await fsExtra.pathExists(path.join(pendingDir, "current.blockmap"))).toBe(true)
  })

  test("blockMapUrl without a cached old blockmap: the old one comes from previousBlockmapBaseUrlOverride when set", async ({ tmpDir, expect }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    updater.previousBlockmapBaseUrlOverride = "https://blockmaps.example.org/old/"
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const blockMapRequests = captureBlockMapRequests(updater)
    const rangeRequestHeaders = captureRangeRequestHeaders(GenericDifferentialDownloader)
    const info = { ...updateInfo(""), files: [{ ...PRE_SIGNED, sha512: "x", size: 10 }] }

    await expect(differentialDownloadInstaller(updater, provider, info, tmpDir)).resolves.toBe(false)

    expect(blockMapRequests.map(it => it.url)).toEqual([PRE_SIGNED.blockMapUrl, "https://blockmaps.example.org/app-1.0.0.exe.blockmap"])
    // the override's origin gets the credentials, as without blockMapUrl
    expect(blockMapRequests[1].headers).toHaveProperty("authorization", "Bearer s")
    expect(rangeRequestHeaders).toHaveLength(1)
  })

  // ── v27 behaviour changes announce themselves (plain-JavaScript apps get no type error) ──

  describe("cross-origin download notices", () => {
    const SECRET_FEED_URL = "https://feed.example.com/updates/?token=feed-secret-value&tenant=tenant-secret-value"
    const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#update-credentials-stay-on-the-feeds-origin"

    async function setUp(tmpDir: TmpDir, options: { feedUrl?: string; auth?: boolean } = {}) {
      const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
      if (options.auth === false) {
        updater.requestHeaders = { "Accept-Language": "en" }
      }
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
      updater.logger = logger
      const provider = createProvider(updater, { provider: "generic", url: options.feedUrl ?? SECRET_FEED_URL } as GenericServerOptions)
      const downloadOptions = downloadUpdateOptions(updater, provider, updateInfo("app-1.1.0.exe"))
      const headersFor = (url: string, originUrl?: string) =>
        (updater as any).downloadRequestHeaders(new URL(url), downloadOptions, originUrl == null ? undefined : new URL(originUrl)) as OutgoingHttpHeaders
      const warnings = () => logger.warn.mock.calls.map(it => String(it[0]))
      return { updater, headersFor, warnings }
    }

    // the headers left off are the ones crossOriginHeaders leaves out, which the app chose: only the feed query is announced
    test("a cross-origin download announces the feed query once, by name only, and not the headers left off", async ({ tmpDir, expect }) => {
      const { headersFor, warnings } = await setUp(tmpDir)

      expect(headersFor("https://cdn.example.net/app-1.1.0.exe")).not.toHaveProperty("authorization")
      headersFor("https://cdn.example.net/app-1.1.0.exe.blockmap")
      headersFor("https://other.example.org/app-1.0.0.exe.blockmap")

      expect(warnings()).toHaveLength(1)
      const [queryNotice] = warnings()
      expect(queryNotice).toContain("adds the feed URL's query string (token, tenant) only to URLs on the update feed's origin (https://feed.example.com)")
      expect(queryNotice).toContain("not added to the download from https://cdn.example.net")
      expect(queryNotice).toContain(DOCS)
      for (const secret of ["Bearer s", "feed-secret-value", "tenant-secret-value", "acme"]) {
        expect(queryNotice).not.toContain(secret)
      }
    })

    test("same-origin downloads and the http → https upgrade announce nothing", async ({ tmpDir, expect }) => {
      const { headersFor, warnings } = await setUp(tmpDir, { feedUrl: "http://feed.example.com/updates/?token=t" })

      headersFor("http://feed.example.com/updates/app-1.1.0.exe")
      headersFor("https://feed.example.com/updates/app-1.1.0.exe")

      expect(warnings()).toEqual([])
    })

    test("only allowlisted headers and no feed query: a cross-origin download announces nothing", async ({ tmpDir, expect }) => {
      const { headersFor, warnings } = await setUp(tmpDir, { feedUrl: "https://feed.example.com/updates/", auth: false })

      headersFor("https://cdn.example.net/app-1.1.0.exe")

      expect(warnings()).toEqual([])
    })

    test("the old blockmap on the previousBlockmapBaseUrlOverride origin announces nothing", async ({ tmpDir, expect }) => {
      const { headersFor, warnings } = await setUp(tmpDir)

      headersFor("https://blockmaps.example.org/updates/app-1.0.0.exe.blockmap", "https://blockmaps.example.org/old/")

      expect(warnings()).toEqual([])
    })

    test("a blockmap off the override origin announces nothing: it never had the feed query", async ({ tmpDir, expect }) => {
      const { headersFor, warnings } = await setUp(tmpDir)

      expect(headersFor("https://cdn.example.net/app-1.0.0.exe.blockmap", "https://blockmaps.example.org/old/")).not.toHaveProperty("authorization")

      expect(warnings()).toEqual([])
    })
  })
})

// The updater's own executor (built when no app adapter is passed) follows a cross-origin redirect with the crossOriginHeaders of the
// provider of the latest check, then the one of the last check.
describe("the updater's own executor sends on the crossOriginHeaders on a cross-origin redirect", () => {
  test("a redirect to another origin through Electron's net sends on the headers crossOriginHeaders lists", async ({ expect }) => {
    const requests: Array<EventEmitter> = []
    const requestOptions: Array<RequestOptions> = []
    const electron = {
      app: Object.assign(new EventEmitter(), {
        whenReady: () => new Promise<void>(() => undefined),
        getVersion: () => "1.0.0",
        getName: () => "cross-origin-redirect-app",
        getAppPath: () => __dirname,
        getPath: () => __dirname,
        isPackaged: false,
      }),
      session: { fromPartition: () => ({}) },
      net: {
        request: (options: RequestOptions) => {
          requestOptions.push(options)
          const request: EventEmitter = Object.assign(new EventEmitter(), {
            end: () => undefined,
            abort: () => request.emit("abort"),
          })
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
      const updater = new NsisUpdater()
      updater.logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      // as a checkForUpdates({ crossOriginHeaders }) keeps them
      ;(updater as any).checkCrossOriginHeaders = (defaults: ReadonlyArray<string>) => [...defaults, "x-tenant"]
      const redirect = async (headers: OutgoingHttpHeaders) => {
        const done = updater.httpExecutor.request({ protocol: "https:", hostname: "feed.example.com", path: "/updates/latest.yml", headers }).catch((e: unknown) => e)
        requests[requests.length - 1].emit("redirect", 302, "GET", "https://cdn.example.net/latest.yml")
        requests[requests.length - 1].emit("error", new Error("end of test"))
        await done
        return requestOptions[requestOptions.length - 1]
      }

      const redirected = await redirect({ "X-Tenant": "acme", Authorization: "Bearer s", accept: "*/*" })
      expect(redirected.hostname).toBe("cdn.example.net")
      expect(redirected.headers).toMatchObject({ "X-Tenant": "acme", accept: "*/*" })
      expect(redirected.headers).not.toHaveProperty("Authorization")

      // the function of a later check takes effect on the next redirect
      ;(updater as any).checkCrossOriginHeaders = () => null
      expect((await redirect({ "X-Tenant": "acme", Authorization: "Bearer s" })).headers).toMatchObject({ "X-Tenant": "acme", Authorization: "Bearer s" })

      // once a check has a provider, it chooses first, and the app gets its choice
      const calls: Array<readonly [string, ReadonlyArray<string>, CrossOriginRequest]> = []
      ;(updater as any).checkProvider = {
        crossOriginHeaders: (defaults: ReadonlyArray<string>, request: CrossOriginRequest) => {
          calls.push(["provider", defaults, request])
          return [...defaults, "x-tenant"]
        },
      }
      ;(updater as any).checkCrossOriginHeaders = (defaults: ReadonlyArray<string>, request: CrossOriginRequest) => {
        calls.push(["app", defaults, request])
        return defaults.filter(it => it !== "accept")
      }
      const layered = await redirect({ "X-Tenant": "acme", Authorization: "Bearer s", accept: "*/*" })
      expect(layered.headers).toMatchObject({ "X-Tenant": "acme" })
      expect(layered.headers).not.toHaveProperty("Authorization")
      expect(layered.headers).not.toHaveProperty("accept")
      const request = { from: new URL("https://feed.example.com/updates/latest.yml"), to: new URL("https://cdn.example.net/latest.yml"), kind: "redirect" }
      expect(calls).toEqual([
        ["provider", DEFAULT_CROSS_ORIGIN_HEADERS, request],
        ["app", [...DEFAULT_CROSS_ORIGIN_HEADERS, "x-tenant"], request],
      ])
    } finally {
      moduleInternals._load = load
    }
  })
})

// A provider chooses the headers of its requests to another origin first (Provider.crossOriginHeaders), and the app's crossOriginHeaders
// of checkForUpdates gets that choice and decides. Provider.feedBaseUrl only gives the requests their `from`: without it, both are asked
// about every request.
describe("the provider's and the app's crossOriginHeaders choose the headers sent to another origin", () => {
  const FEED = "https://feed.example.com/updates/"
  const INFO: UpdateInfo = { version: "1.1.0", files: [{ url: "app-1.1.0.exe", sha512: "x", size: 10 }], releaseDate: "2024-01-01T00:00:00.000Z" }

  // records the calls of both layers, in order
  const calls: Array<readonly ["provider" | "app", ReadonlyArray<string>, CrossOriginRequest]> = []

  class TestProvider extends Provider<UpdateInfo> {
    constructor(
      private readonly declared: URL | null | undefined,
      private readonly choose: CrossOriginHeadersCallback = defaults => defaults
    ) {
      super({ isUseMultipleRangeRequest: false, platform: "win32", executor: {} as any })
    }

    get feedBaseUrl(): URL | null | undefined {
      return this.declared
    }

    crossOriginHeaders(defaults: ReadonlyArray<string>, request: CrossOriginRequest): ReadonlyArray<string> | null {
      calls.push(["provider", defaults, request])
      return this.choose(defaults, request)
    }

    getLatestVersion(): Promise<UpdateInfo> {
      return Promise.resolve(INFO)
    }

    resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
      return resolveFiles(updateInfo, new URL(FEED))
    }
  }

  afterEach(() => {
    calls.splice(0)
    vi.restoreAllMocks()
  })

  async function createUpdater(provider: Provider<any>, app: CrossOriginHeadersCallback = defaults => defaults) {
    const updater = await createNsisUpdater("1.0.0")
    updater.requestHeaders = { "X-Tenant": "acme" }
    updater.addAuthHeader("Bearer s")
    // the crossOriginHeaders a checkForUpdates({ crossOriginHeaders }) keeps for the download
    ;(updater as any).checkCrossOriginHeaders = (defaults: ReadonlyArray<string>, request: CrossOriginRequest) => {
      calls.push(["app", defaults, request])
      return app(defaults, request)
    }
    ;(updater as any).updateInfoAndProvider = { info: INFO, provider }
    const doDownloadUpdate = vi.spyOn(updater as any, "doDownloadUpdate").mockResolvedValue([])
    const options: DownloadUpdateOptions = {
      updateInfoAndProvider: { info: INFO, provider },
      requestHeaders: (updater as any).computeRequestHeaders(provider),
      cancellationToken: new CancellationToken(),
    }
    const downloadRequestHeaders = (url: string): OutgoingHttpHeaders => (updater as any).downloadRequestHeaders(new URL(url), options)
    return { updater, doDownloadUpdate, options, downloadRequestHeaders }
  }

  test("the provider is asked first, and its choice is the app's defaults", async ({ expect }) => {
    const { downloadRequestHeaders } = await createUpdater(new TestProvider(new URL(FEED), defaults => [...defaults, "x-tenant"]))

    const headers = downloadRequestHeaders("https://cdn.example.net/app-1.1.0.exe")
    const request = { from: new URL(FEED), to: new URL("https://cdn.example.net/app-1.1.0.exe"), kind: "request" }
    expect(calls).toEqual([
      ["provider", DEFAULT_CROSS_ORIGIN_HEADERS, request],
      ["app", [...DEFAULT_CROSS_ORIGIN_HEADERS, "x-tenant"], request],
    ])
    expect(headers).toEqual({ accept: "*/*", "X-Tenant": "acme" })
  })

  test("a provider choosing null gives the app the names of every header of the request", async ({ expect }) => {
    const { downloadRequestHeaders } = await createUpdater(new TestProvider(new URL(FEED), () => null))

    downloadRequestHeaders("https://cdn.example.net/app-1.1.0.exe")
    expect(calls.map(([layer, defaults]) => [layer, defaults])).toEqual([
      ["provider", DEFAULT_CROSS_ORIGIN_HEADERS],
      ["app", ["accept", "X-Tenant", "authorization"]],
    ])
  })

  test("the app decides: it can leave out what the provider chose, or send what it left out", async ({ expect }) => {
    const providerSendsAll = await createUpdater(new TestProvider(new URL(FEED), () => null), defaults => defaults.filter(it => it !== "authorization"))
    expect(providerSendsAll.downloadRequestHeaders("https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*", "X-Tenant": "acme" })

    const providerSendsDefaults = await createUpdater(new TestProvider(new URL(FEED)), () => null)
    expect(providerSendsDefaults.downloadRequestHeaders("https://cdn.example.net/app-1.1.0.exe")).toEqual({ accept: "*/*", "X-Tenant": "acme", authorization: "Bearer s" })
  })

  test("the feed's origin asks neither and gets every header", async ({ expect }) => {
    const { downloadRequestHeaders, options } = await createUpdater(new TestProvider(new URL(FEED), () => []), () => [])

    expect(downloadRequestHeaders(`${FEED}app-1.1.0.exe`)).toBe(options.requestHeaders)
    expect(calls).toEqual([])
  })

  // feedBaseUrl only fills `from`: a provider without one is asked about every request, and the download is not refused
  test.for([
    ["undefined (the default)", undefined],
    ["null", null],
  ] as const)("a feedBaseUrl of %s: both are asked about every download URL, with from null", async ([, declared], { expect }) => {
    const { updater, doDownloadUpdate, downloadRequestHeaders } = await createUpdater(new TestProvider(declared, defaults => [...defaults, "x-tenant"]))

    await expect(updater.downloadUpdate()).resolves.toEqual([])
    expect(doDownloadUpdate).toHaveBeenCalledTimes(1)
    expect(downloadRequestHeaders(`${FEED}app-1.1.0.exe`)).toEqual({ accept: "*/*", "X-Tenant": "acme" })
    expect(calls.map(([layer, , request]) => [layer, request.from, request.to.href])).toEqual([
      ["provider", null, `${FEED}app-1.1.0.exe`],
      ["app", null, `${FEED}app-1.1.0.exe`],
    ])
  })

  test("an update info request on another origin: the provider, then the runtime options' crossOriginHeaders", async ({ expect }) => {
    const provider = new TestProvider(new URL(FEED), defaults => [...defaults, "x-tenant"])
    ;(provider as any).runtimeOptions.crossOriginHeaders = (defaults: ReadonlyArray<string>, request: CrossOriginRequest) => {
      calls.push(["app", defaults, request])
      return defaults
    }
    provider.setRequestHeaders({ authorization: "Bearer s", "X-Tenant": "acme", "Accept-Language": "de" })

    const options: RequestOptions = (provider as any).createRequestOptions(new URL("https://cdn.example.net/latest.yml"), { "X-Explicit": "e" })
    expect(options.hostname).toBe("cdn.example.net")
    // headers passed for the one request are sent as given
    expect(options.headers).toEqual({ "X-Tenant": "acme", "Accept-Language": "de", "X-Explicit": "e" })
    expect(calls.map(([layer, defaults]) => [layer, defaults])).toEqual([
      ["provider", DEFAULT_CROSS_ORIGIN_HEADERS],
      ["app", [...DEFAULT_CROSS_ORIGIN_HEADERS, "x-tenant"]],
    ])

    // same origin: every request header, neither asked
    calls.splice(0)
    const sameOrigin: RequestOptions = (provider as any).createRequestOptions(new URL(`${FEED}latest.yml`))
    expect(sameOrigin.headers).toEqual({ authorization: "Bearer s", "X-Tenant": "acme", "Accept-Language": "de" })
    expect(calls).toEqual([])
  })

  // fail closed: the request is not made, and the app is not asked
  test.for([
    [
      "throws",
      () => {
        throw new Error("Bearer value-secret")
      },
      "crossOriginHeaders of the update provider TestProvider threw for the request from https://feed.example.com to https://cdn.example.net, which is not sent.",
    ],
    [
      "returns a header value",
      () => "Bearer value-secret" as unknown as ReadonlyArray<string>,
      "crossOriginHeaders of the update provider TestProvider must return an array of header names",
    ],
  ] as const)("a provider crossOriginHeaders that %s fails that request with ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS", async ([, choose, message], { expect }) => {
    const { downloadRequestHeaders } = await createUpdater(new TestProvider(new URL(FEED), choose))

    let error: unknown = null
    try {
      downloadRequestHeaders("https://cdn.example.net/app-1.1.0.exe")
    } catch (e: unknown) {
      error = e
    }
    expect(error).toMatchObject({ code: "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS", message: expect.stringContaining(message) })
    expect(String((error as Error).message)).not.toContain("value-secret")
    expect(calls.map(([layer]) => layer)).toEqual(["provider"])
  })

  // e.g. a custom provider written in plain JavaScript, or its method removed: named, rather than a "threw" error
  test("a provider without a crossOriginHeaders method fails the request with ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED naming it", async ({ expect }) => {
    const provider = new TestProvider(new URL(FEED))
    Object.defineProperty(provider, "crossOriginHeaders", { value: undefined })
    provider.setRequestHeaders({ authorization: "Bearer s" })

    expect(() => (provider as any).createRequestOptions(new URL("https://cdn.example.net/latest.yml"))).toThrow(
      expect.objectContaining({
        code: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
        message: expect.stringMatching(
          /^The update provider TestProvider has no crossOriginHeaders method: .*https:\/\/www\.electron\.build\/docs\/migration\/v27-developer-changes#custom-provider-cross-origin-headers$/
        ),
      })
    )
  })
})

// The built-in providers send the default list to another origin, and leave the decision to the app.
describe("the built-in providers' crossOriginHeaders", () => {
  const request: CrossOriginRequest = { from: new URL("https://feed.example.com/"), to: new URL("https://cdn.example.net/app.exe"), kind: "request" }
  const defaults: ReadonlyArray<string> = ["accept", "x-from-the-test"]

  test.for([
    ["generic", { provider: "generic", url: "https://feed.example.com/" }],
    ["s3", { provider: "s3", bucket: "bucket" }],
    ["spaces", { provider: "spaces", name: "space", region: "nyc3" }],
    ["github", { provider: "github", owner: "owner", repo: "repo" }],
    ["gitlab", { provider: "gitlab", projectId: 1 }],
    ["bitbucket", { provider: "bitbucket", owner: "owner", slug: "slug" }],
    ["keygen", { provider: "keygen", account: "account", product: "product" }],
  ] as const)("%s returns defaults", async ([, options], { expect }) => {
    const updater = await createNsisUpdater("1.0.0")
    const provider = createClient(options, updater, { isUseMultipleRangeRequest: false, platform: "win32", executor: {} as any })

    expect(provider.crossOriginHeaders(defaults, request)).toBe(defaults)
  })

  // private GitHub has no feed URL: its release lookup, channel file and downloads use the GitHub API's asset URLs, which need the token
  test.for([
    ["api.github.com", undefined, "https://api.github.com"],
    ["a GitHub Enterprise host", "github.example.com", "https://github.example.com"],
  ] as const)("private GitHub sends every header to the API on %s, defaults elsewhere", async ([, host, api], { expect }) => {
    const updater = await createNsisUpdater("1.0.0")
    const provider = createClient({ provider: "github", owner: "owner", repo: "repo", token: "t", host }, updater, {
      isUseMultipleRangeRequest: false,
      platform: "win32",
      executor: {} as any,
    })
    const choose = (to: string, kind: CrossOriginRequest["kind"] = "request", from: URL | null = null) => provider.crossOriginHeaders(defaults, { from, to: new URL(to), kind })

    expect(provider.feedBaseUrl).toBeNull()
    expect(choose(`${api}/repos/owner/repo/releases/assets/1`)).toBeNull()
    // the storage a download is redirected to
    expect(choose("https://objects.githubusercontent.com/app.exe", "redirect", new URL(`${api}/repos/owner/repo/releases/assets/1`))).toBe(defaults)
    expect(choose("https://cdn.example.net/app.exe")).toBe(defaults)
  })
})
