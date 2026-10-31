import { CancellationToken, isLoopbackHostname } from "builder-util-runtime"
import { DOWNLOAD_GAP_COALESCE_THRESHOLD } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { NsisUpdater } from "electron-updater/src/NsisUpdater"
import { createHash } from "crypto"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import type { OutgoingHttpHeaders, RequestOptions } from "http"
import Module from "node:module"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { describe, test } from "vitest"
import { blockMapOf, FakeElectronHttpExecutor, FakeNetAnswer, tuneTestUpdater } from "../helpers/updaterTestUtil.js"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"

// electron-updater sends every update request (feed, downloads, blockmaps, differential ranges and every redirect) over https,
// except to a loopback host, unless the app sets allowInsecureFeed.

const HTTPS_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const HTTP_URL = "http://feed.example.com/updates/app-1.1.0.exe"
const HTTPS_TARGET_URL = "https://bucket.example.net/app-1.1.0.exe"
const HTTP_TARGET_URL = "http://bucket.example.net/app-1.1.0.exe"
const BODY = Buffer.from("update")
const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https"
// without the fix, a request that cannot be created from a callback leaves the download pending forever: fail fast instead
const GUARD_TIMEOUT = 10_000

const INSECURE_FEED = { code: "ERR_UPDATER_INSECURE_FEED" }

function createExecutor(redirects: Record<string, string> = {}, isInsecureFeedAllowed?: () => boolean): FakeElectronHttpExecutor {
  return new FakeElectronHttpExecutor(
    url => {
      const location = redirects[url]
      return location == null ? { statusCode: 200, body: BODY } : { location }
    },
    { isInsecureFeedAllowed }
  )
}

function apiRequestOptions(url: string, headers?: Record<string, string>): RequestOptions {
  const parsed = new URL(url)
  const options: RequestOptions & { redirect: "manual" } = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port === "" ? undefined : parsed.port,
    path: parsed.pathname,
    headers,
    redirect: "manual",
  }
  return options
}

const REQUESTS: ReadonlyArray<readonly [string, (executor: FakeElectronHttpExecutor, url: string, tmpDir: TmpDir) => Promise<unknown>]> = [
  ["an API request", (executor, url) => executor.request(apiRequestOptions(url))],
  [
    "a download",
    async (executor, url, tmpDir) => {
      const dir = await tmpDir.getTempDir({ prefix: "insecure-feed" })
      await fsExtra.ensureDir(dir)
      return await executor.download(new URL(url), path.join(dir, "app.exe"), { cancellationToken: new CancellationToken() })
    },
  ],
  ["a download to a buffer", (executor, url) => executor.downloadToBuffer(new URL(url), { cancellationToken: new CancellationToken() })],
]

describe("isLoopbackHostname", () => {
  test.for(["localhost", "LOCALHOST", "127.0.0.1", "127.255.0.42", "[::1]", "::1"])("%s is loopback", (hostname, { expect }) => {
    expect(isLoopbackHostname(hostname)).toBe(true)
  })

  test.for(["feed.example.com", "localhost.example.com", "127.0.0.1.example.com", "128.0.0.1", "10.0.0.1", "0.0.0.0", "[::2]", "[::ffff:7f00:1]"])(
    "%s is not loopback",
    (hostname, { expect }) => {
      expect(isLoopbackHostname(hostname)).toBe(false)
    }
  )
})

describe("ElectronHttpExecutor rejects plain http", () => {
  for (const [kind, send] of REQUESTS) {
    test(`an http URL fails ${kind} before any request is sent`, async ({ tmpDir, expect }) => {
      const executor = createExecutor()
      const error = await send(executor, HTTP_URL, tmpDir).then(
        () => null,
        (e: unknown) => e
      )
      expect(error).toMatchObject(INSECURE_FEED)
      expect((error as Error).message).toContain("electron-updater rejects the update request to http://feed.example.com:")
      expect((error as Error).message).toContain("autoUpdater.allowInsecureFeed = true")
      expect((error as Error).message).toContain(DOCS)
      expect(executor.sent).toEqual([])
    })

    test(`an https to http redirect fails ${kind}`, async ({ tmpDir, expect }) => {
      const executor = createExecutor({ [HTTPS_URL]: HTTP_TARGET_URL })
      await expect(send(executor, HTTPS_URL, tmpDir)).rejects.toMatchObject(INSECURE_FEED)
      expect(executor.sent.map(it => it.url)).toEqual([HTTPS_URL])
    })

    test(`an https to https redirect is followed by ${kind}`, async ({ tmpDir, expect }) => {
      const executor = createExecutor({ [HTTPS_URL]: HTTPS_TARGET_URL })
      await send(executor, HTTPS_URL, tmpDir)
      expect(executor.sent.map(it => it.url)).toEqual([HTTPS_URL, HTTPS_TARGET_URL])
    })

    test.for(["http://127.0.0.1:8080/app.exe", "http://127.1.2.3/app.exe", "http://localhost:8080/app.exe", "http://[::1]:8080/app.exe"])(
      `a loopback http URL %s is allowed for ${kind}`,
      async (url, { tmpDir, expect }) => {
        const executor = createExecutor()
        await send(executor, url, tmpDir)
        expect(executor.sent.map(it => it.url)).toEqual([url])
      }
    )

    test(`allowInsecureFeed allows an http URL and an https to http redirect for ${kind}`, async ({ tmpDir, expect }) => {
      const executor = createExecutor({ [HTTPS_URL]: HTTP_TARGET_URL }, () => true)
      await send(executor, HTTP_URL, tmpDir)
      await send(executor, HTTPS_URL, tmpDir)
      expect(executor.sent.map(it => it.url)).toEqual([HTTP_URL, HTTPS_URL, HTTP_TARGET_URL])
    })
  }

  // Electron reports a 300 (and other non-redirect 3xx) as a response, whose Location a download follows itself
  test("a 300 response with a Location to http fails a download", async ({ tmpDir, expect }) => {
    const executor = new FakeElectronHttpExecutor(url =>
      url === HTTPS_URL ? { statusCode: 300, headers: { location: HTTP_TARGET_URL }, body: BODY } : { statusCode: 200, body: BODY }
    )
    const destination = path.join(await tmpDir.getTempDir({ prefix: "insecure-feed" }), "app.exe")
    await expect(executor.download(new URL(HTTPS_URL), destination, { cancellationToken: new CancellationToken() })).rejects.toMatchObject(INSECURE_FEED)
    expect(executor.sent.map(it => it.url)).toEqual([HTTPS_URL])
  })

  // net.request connects to the host of a Host header, not to the hostname
  test("a loopback http hostname with a Host header for another host fails", async ({ expect }) => {
    const executor = createExecutor()
    await expect(executor.request(apiRequestOptions("http://127.0.0.1:8080/latest.yml", { Host: "feed.example.com" }))).rejects.toMatchObject(INSECURE_FEED)
    expect(executor.sent).toEqual([])
  })

  test("an insecure request is rejected once allowInsecureFeed is turned off again", async ({ expect }) => {
    let isAllowed = true
    const executor = createExecutor({}, () => isAllowed)
    await executor.request(apiRequestOptions(HTTP_URL))
    isAllowed = false
    await expect(executor.request(apiRequestOptions(HTTP_URL))).rejects.toMatchObject(INSECURE_FEED)
    expect(executor.sent.map(it => it.url)).toEqual([HTTP_URL])
  })
})

// An updater created without an app adapter, as in a real app, builds its own ElectronHttpExecutor: it must read the property. Electron
// loads "electron" through require (see ElectronAppAdapter), so a stub of what the constructor and net.request touch stands in for it.
describe("AppUpdater.allowInsecureFeed", () => {
  test("is read by the updater's own executor on every request", ({ expect }) => {
    const sent: Array<unknown> = []
    const electron = {
      app: Object.assign(new EventEmitter(), {
        whenReady: () => new Promise<void>(() => undefined),
        getVersion: () => "1.0.0",
        getName: () => "insecure-feed-app",
        getAppPath: () => __dirname,
        getPath: () => __dirname,
        isPackaged: false,
      }),
      session: { fromPartition: () => ({}) },
      net: {
        request: (options: unknown) => {
          sent.push(options)
          return new EventEmitter()
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
      const send = () => updater.httpExecutor.createRequest(apiRequestOptions(HTTP_URL), () => undefined)

      expect(updater.allowInsecureFeed).toBe(false)
      expect(send).toThrow(expect.objectContaining(INSECURE_FEED))
      updater.allowInsecureFeed = true
      send()
      expect(sent).toMatchObject([{ protocol: "http:", hostname: "feed.example.com" }])
    } finally {
      moduleInternals._load = load
    }
  })
})

// The channel file is fetched through Provider.channelFileRequest (size limited, credential headers kept to the feed origin): that request
// and its redirects go through the same executor check.
describe("channel file request of an update check", () => {
  async function checkForUpdates(tmpDir: TmpDir, feedUrl: string, executor: FakeElectronHttpExecutor): Promise<unknown> {
    const updater = new NsisUpdater(null, new TestAppAdapter("1.0.0", await tmpDir.getTempDir({ prefix: "insecure-feed-app" })))
    tuneTestUpdater(updater)
    updater.autoDownload = false
    ;(updater as any).httpExecutor = executor
    updater.setFeedURL({ provider: "generic", url: feedUrl })
    return await updater.checkForUpdates()
  }

  test("fails for an http feed before any request is sent", async ({ tmpDir, expect }) => {
    const executor = createExecutor()
    await expect(checkForUpdates(tmpDir, "http://feed.example.com/updates", executor)).rejects.toMatchObject(INSECURE_FEED)
    expect(executor.sent).toEqual([])
  })

  test("fails when the channel file of an https feed is redirected to http", async ({ tmpDir, expect }) => {
    const channelUrl = "https://feed.example.com/updates/latest.yml"
    const executor = new FakeElectronHttpExecutor(url => (url.startsWith(channelUrl) ? { location: "http://bucket.example.net/latest.yml" } : { statusCode: 200, body: BODY }))
    await expect(checkForUpdates(tmpDir, "https://feed.example.com/updates", executor)).rejects.toMatchObject(INSECURE_FEED)
    expect(executor.sent.map(it => it.url.split("?")[0])).toEqual([channelUrl])
  })
})

// The plan copies the unchanged start from the old file and then downloads the changed last block: that range request is sent from the
// copy's callback, where a request that cannot be created must fail the download.
describe("differential download from an http URL", () => {
  const BLOCK = 16
  const OLD = Buffer.from("a".repeat(BLOCK) + "b".repeat(DOWNLOAD_GAP_COALESCE_THRESHOLD) + "c".repeat(BLOCK))
  const NEW = Buffer.from("a".repeat(BLOCK) + "b".repeat(DOWNLOAD_GAP_COALESCE_THRESHOLD) + "z".repeat(BLOCK))

  function serveRange(headers: OutgoingHttpHeaders): FakeNetAnswer {
    const [start, end] = String(headers.range)
      .replace(/^bytes=/, "")
      .split("-")
      .map(Number)
    return { statusCode: 206, headers: { "content-range": `bytes ${start}-${end}/${NEW.length}` }, body: NEW.subarray(start, end + 1) }
  }

  async function download(tmpDir: TmpDir, url: string, executor: FakeElectronHttpExecutor): Promise<Buffer> {
    const dir = await tmpDir.getTempDir({ prefix: "insecure-feed-differential" })
    await fsExtra.ensureDir(dir)
    const oldFile = path.join(dir, "old.exe")
    const newFile = path.join(dir, "new.exe")
    await fsExtra.writeFile(oldFile, OLD)
    const downloader = new GenericDifferentialDownloader({ size: NEW.length, sha512: createHash("sha512").update(NEW).digest("base64") }, executor, {
      newUrl: new URL(url),
      oldFile,
      newFile,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      requestHeaders: null,
      isUseMultipleRangeRequest: false,
      cancellationToken: new CancellationToken(),
    })
    await downloader.download(blockMapOf(OLD, BLOCK), blockMapOf(NEW, BLOCK))
    return await fsExtra.readFile(newFile)
  }

  test(
    "fails with ERR_UPDATER_INSECURE_FEED",
    async ({ tmpDir, expect }) => {
      const executor = new FakeElectronHttpExecutor((_url, headers) => serveRange(headers))
      await expect(download(tmpDir, HTTP_URL, executor)).rejects.toMatchObject(INSECURE_FEED)
      expect(executor.sent).toEqual([])
    },
    GUARD_TIMEOUT
  )

  test(
    "fails when its range request is redirected from https to http",
    async ({ tmpDir, expect }) => {
      const executor = new FakeElectronHttpExecutor((url, headers) => (url === HTTPS_URL ? { location: HTTP_TARGET_URL } : serveRange(headers)))
      await expect(download(tmpDir, HTTPS_URL, executor)).rejects.toMatchObject(INSECURE_FEED)
      expect(executor.sent.map(it => it.url)).toEqual([HTTPS_URL])
    },
    GUARD_TIMEOUT
  )

  // positive control: the same download over https
  test("succeeds over https", async ({ tmpDir, expect }) => {
    const executor = new FakeElectronHttpExecutor((_url, headers) => serveRange(headers))
    expect(await download(tmpDir, HTTPS_URL, executor)).toEqual(NEW)
  })
})
