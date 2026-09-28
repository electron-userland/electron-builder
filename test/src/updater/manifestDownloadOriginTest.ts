import { CancellationToken, DownloadOptions, GenericServerOptions, GithubOptions, PublishConfiguration, UpdateInfo } from "builder-util-runtime"
import { serializeToYaml } from "builder-util"
import { AppImageUpdater, AppUpdater } from "electron-updater"
import type { DownloadUpdateOptions } from "electron-updater/src/AppUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "electron-updater/src/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { createClient } from "electron-updater/src/providerFactory"
import type { Provider } from "electron-updater/src/providers/Provider"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, Server } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, expect, test, vi } from "vitest"
import { gzipSync } from "zlib"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, createTestAppAdapter, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// The app's credential-bearing request headers (requestHeaders / addAuthHeader) and the feed URL's query are only sent to
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
    const root = await tmpDir.getTempDir()
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

  test("a download on another origin gets no credential headers or feed query", async ({ tmpDir }) => {
    const feed = await serve(tmpDir)
    const foreign = await serve(tmpDir)
    await feed.write("latest.yml", channelYml(`${foreign.url}/${INSTALLER_NAME}`))
    await foreign.write(INSTALLER_NAME, INSTALLER)
    const updater = await createUpdater(feed.url)
    const events = trackEvents(updater)

    const { updateFile } = (await (await updater.checkForUpdates())!.downloadPromise)!
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

  test("the web package on another origin gets no credentials; the same-origin installer keeps them", async ({ tmpDir }) => {
    const feed = await serve(tmpDir)
    const foreign = await serve(tmpDir)
    await feed.write("latest.yml", channelYml(INSTALLER_NAME, { [process.arch]: { path: `${foreign.url}/${PACKAGE_NAME}`, sha512: sha512(PACKAGE), size: PACKAGE.length } }))
    await feed.write(INSTALLER_NAME, INSTALLER)
    await foreign.write(PACKAGE_NAME, PACKAGE)
    const updater = await createUpdater(feed.url)
    updater.disableWebInstaller = false
    const events = trackEvents(updater)

    const { packageFile } = (await (await updater.checkForUpdates())!.downloadPromise)!
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
    ;(updater as any).downloadedUpdateHelper = new DownloadedUpdateHelper(await tmpDir.getTempDir())
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
    const installerPath = path.join(await tmpDir.getTempDir(), "installer.exe")
    return (updater as any).differentialDownloadInstaller(fileInfo, downloadUpdateOptions(updater, provider, info), installerPath, provider, "installer.exe")
  }

  // another host, and the feed's host over plain http
  test.for(["https://cdn.example.net/", "http://feed.example.com/updates/"])(
    "blockmaps and range requests of a file on another origin (%s) get no credentials or feed query",
    async (base, { tmpDir }) => {
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

  test("same-origin blockmaps and range requests keep credentials and feed query", async ({ tmpDir }) => {
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
  ])("$name: blockmaps derived from a same-origin file URL that resolve to another host get no credentials", async ({ options, fileUrl, extra, override }, { tmpDir }) => {
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

  test("the old blockmap from an app-set previousBlockmapBaseUrlOverride keeps credentials", async ({ tmpDir }) => {
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

  test("the NSIS web-package differential download strips credentials for another origin", async ({ tmpDir }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const rangeRequestHeaders = captureRangeRequestHeaders(FileWithEmbeddedBlockMapDifferentialDownloader)
    const options = downloadUpdateOptions(updater, provider, updateInfo("app-1.1.0.exe"))
    const packagePath = path.join(await tmpDir.getTempDir(), "package.7z")
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

  test("the AppImage differential download strips credentials for another origin", async ({ tmpDir }) => {
    const updater = await setUpUpdater(new AppImageUpdater(null, await createTestAppAdapter("1.0.0")), tmpDir)
    const provider = createProvider(updater, { provider: "generic", url: FEED_URL } as GenericServerOptions)
    const rangeRequestHeaders = captureRangeRequestHeaders(FileWithEmbeddedBlockMapDifferentialDownloader)
    const info = updateInfo("https://cdn.example.net/app-1.1.0.AppImage")
    const updateFile = path.join(await tmpDir.getTempDir(), "app.AppImage")

    await expect(
      (updater as any).downloadDifferential(provider.resolveFiles(info)[0], "/old/app.AppImage", updateFile, provider, downloadUpdateOptions(updater, provider, info))
    ).resolves.toBe(false)

    expect(rangeRequestHeaders).toHaveLength(1)
    expect(rangeRequestHeaders[0]).not.toHaveProperty("authorization")
    expect(rangeRequestHeaders[0]).toHaveProperty("accept", "*/*")
  })

  test("a provider without feedBaseUrl (private GitHub, custom) sends the request headers to every download URL", async ({ tmpDir }) => {
    const updater = await setUpUpdater(await createNsisUpdater("1.0.0"), tmpDir)
    const provider = createProvider(updater, { provider: "github", owner: "owner", repo: "repo", token: "t" } as GithubOptions)
    const options = downloadUpdateOptions(updater, provider, updateInfo("app-1.1.0.exe"))

    expect(provider.feedBaseUrl).toBeNull()
    expect((updater as any).downloadRequestHeaders(new URL("https://objects.example.net/app-1.1.0.exe"), options)).toBe(options.requestHeaders)
  })
})
