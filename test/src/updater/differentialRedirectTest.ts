import { BlockMap, CancellationToken } from "builder-util-runtime"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "electron-updater/src/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { ElectronHttpExecutor } from "electron-updater/src/electronHttpExecutor"
import { createHash } from "crypto"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import type { OutgoingHttpHeaders, RequestOptions } from "http"
import * as path from "path"
import { PassThrough } from "stream"
import type { TmpDir } from "temp-file"
import { describe, test } from "vitest"
import { deflateRawSync } from "zlib"

// The differential download makes `redirect: "manual"` Electron net requests, and our Node test server never redirects, so the
// requests go to a fake net request here. Like ElectronHttpExecutor.download, a redirect must not send the credential headers to
// another origin.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const PRE_SIGNED_URL = "https://bucket.example.net/app-1.1.0.exe?X-Amz-Signature=abc"
const SAME_ORIGIN_URL = "https://feed.example.com/files/app-1.1.0.exe"

// three blocks; the middle one is unchanged, so the plan is: download bytes 0-15, copy 16-31 from the old file, download bytes 32-47
const BLOCK = 16
const OLD = Buffer.from("a".repeat(BLOCK) + "b".repeat(BLOCK) + "c".repeat(BLOCK))
const NEW = Buffer.from("x".repeat(BLOCK) + "b".repeat(BLOCK) + "z".repeat(BLOCK))
// only the first block changed: download bytes 0-15, copy 16-47
const OLD_WITH_NEW_END = Buffer.from("a".repeat(BLOCK) + "b".repeat(BLOCK) + "z".repeat(BLOCK))

function blockMapOf(data: Buffer): BlockMap {
  const checksums: Array<string> = []
  const sizes: Array<number> = []
  for (let i = 0; i < data.length; i += BLOCK) {
    checksums.push(
      createHash("sha256")
        .update(data.subarray(i, i + BLOCK))
        .digest("base64")
    )
    sizes.push(BLOCK)
  }
  return { version: "2", files: [{ name: "file", offset: 0, checksums, sizes }] }
}

// like an AppImage or an NSIS web installer package: the deflated blockmap and its size are appended to the file
function withEmbeddedBlockMap(data: Buffer): Buffer {
  const blockMap = deflateRawSync(JSON.stringify(blockMapOf(data)))
  const size = Buffer.alloc(4)
  size.writeUInt32BE(blockMap.length)
  return Buffer.concat([data, blockMap, size])
}

interface SentRequest {
  readonly url: string
  readonly headers: OutgoingHttpHeaders
}

// the multi-range downloader names the header "Range"
function rangeOf(headers: OutgoingHttpHeaders): string {
  return String(headers.range ?? headers.Range)
}

const BOUNDARY = "fake-boundary"

// Stands in for Electron's net ClientRequest: a redirect is reported as a "redirect" event. With `redirect: "manual"` the request
// must then be aborted (or it fails); with the default ("follow") it is sent again to the new URL, with the same headers.
class FakeNetRequest extends EventEmitter {
  private isAborted = false
  private redirectCount = 0

  constructor(
    private readonly executor: FakeElectronHttpExecutor,
    private url: string,
    private readonly headers: OutgoingHttpHeaders,
    private readonly redirect: string | undefined
  ) {
    super()
  }

  end(): void {
    this.send()
  }

  abort(): void {
    this.isAborted = true
    this.executor.abortedUrls.push(this.url)
    this.emit("abort")
  }

  private send(): void {
    this.executor.requests.push({ url: this.url, headers: this.headers })
    setImmediate(() => {
      const location = this.executor.redirects[this.url]
      if (location == null) {
        this.respond()
        return
      }
      // Chromium's limit
      if (++this.redirectCount > 20) {
        this.emit("error", new Error("net::ERR_TOO_MANY_REDIRECTS"))
        return
      }
      this.emit("redirect", 302, "GET", location)
      if (this.isAborted) {
        return
      }
      if (this.redirect === "manual") {
        this.emit("error", new Error("Redirect was cancelled"))
        return
      }
      this.url = location
      this.send()
    })
  }

  private respond(): void {
    const { file } = this.executor
    const ranges = rangeOf(this.headers)
      .slice("bytes=".length)
      .split(", ")
      .map(it => it.split("-").map(Number))
    if (ranges.length === 1) {
      const [start, end] = ranges[0]
      this.reply(206, { "content-range": `bytes ${start}-${end}/${file.length}` }, file.subarray(start, end + 1))
    } else if (this.executor.isMultipleRangeSupported) {
      const parts = ranges.map(([start, end]) =>
        Buffer.concat([Buffer.from(`\r\n--${BOUNDARY}\r\nContent-Range: bytes ${start}-${end}/${file.length}\r\n\r\n`), file.subarray(start, end + 1)])
      )
      this.reply(206, { "content-type": `multipart/byteranges; boundary=${BOUNDARY}` }, Buffer.concat([...parts, Buffer.from(`\r\n--${BOUNDARY}--\r\n`)]))
    } else {
      // like S3
      this.reply(200, {}, file)
    }
  }

  private reply(statusCode: number, headers: Record<string, string>, body: Buffer): void {
    const response = Object.assign(new PassThrough(), { statusCode, headers })
    this.emit("response", response)
    response.end(body)
  }
}

class FakeElectronHttpExecutor extends ElectronHttpExecutor {
  readonly requests: Array<SentRequest> = []
  // the URL each aborted request was last sent to
  readonly abortedUrls: Array<string> = []

  constructor(
    readonly file: Buffer,
    readonly redirects: Record<string, string>,
    readonly isMultipleRangeSupported: boolean
  ) {
    super()
  }

  createRequest(options: RequestOptions, callback: (response: any) => void): any {
    const port = options.port == null ? "" : `:${options.port}`
    // like net.request, the headers are copied when the request is created
    const request = new FakeNetRequest(this, `${options.protocol}//${options.hostname}${port}${options.path}`, { ...options.headers }, (options as any).redirect)
    request.on("response", callback)
    return request
  }
}

interface Scenario {
  // OLD by default
  readonly old?: Buffer
  readonly isUseMultipleRangeRequest?: boolean
  readonly isEmbeddedBlockMap?: boolean
  // false: a multi-range request is answered with the whole file
  readonly isMultipleRangeSupported?: boolean
}

describe("differential download redirects", () => {
  async function download(tmpDir: TmpDir, redirects: Record<string, string>, scenario: Scenario = {}) {
    const dir = await tmpDir.createTempDir({ prefix: "differential-redirect" })
    const oldFile = path.join(dir, "old.exe")
    const newFile = path.join(dir, "new.exe")
    const old = scenario.old ?? OLD
    const file = scenario.isEmbeddedBlockMap ? withEmbeddedBlockMap(NEW) : NEW
    await fsExtra.writeFile(oldFile, scenario.isEmbeddedBlockMap ? withEmbeddedBlockMap(old) : old)
    const executor = new FakeElectronHttpExecutor(file, redirects, scenario.isMultipleRangeSupported ?? true)
    const fileInfo = { size: file.length, sha512: createHash("sha512").update(file).digest("base64") }
    const options = {
      newUrl: new URL(FILE_URL),
      oldFile,
      newFile,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      requestHeaders: { authorization: "Bearer feed-secret", "PRIVATE-TOKEN": "gitlab-secret", "X-Tenant": "acme" },
      isUseMultipleRangeRequest: scenario.isUseMultipleRangeRequest ?? false,
      cancellationToken: new CancellationToken(),
    }
    if (scenario.isEmbeddedBlockMap) {
      await new FileWithEmbeddedBlockMapDifferentialDownloader({ ...fileInfo, blockMapSize: file.length - NEW.length - 4 }, executor, options).download()
    } else {
      await new GenericDifferentialDownloader(fileInfo, executor, options).download(blockMapOf(old), blockMapOf(NEW))
    }
    return { requests: executor.requests, abortedUrls: executor.abortedUrls, downloaded: await fsExtra.readFile(newFile), file }
  }

  test("a redirect to another origin gets no credential headers, and neither do the remaining ranges", async ({ tmpDir, expect }) => {
    const { requests, downloaded } = await download(tmpDir, { [FILE_URL]: PRE_SIGNED_URL })

    expect(downloaded).toEqual(NEW)
    expect(requests.map(it => [it.url, it.headers.range])).toEqual([
      [FILE_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=32-47"],
    ])
    // positive control: the feed gets the credentials
    expect(requests[0].headers).toHaveProperty("authorization", "Bearer feed-secret")
    for (const { headers } of requests.slice(1)) {
      expect(headers).not.toHaveProperty("authorization")
      expect(headers).toMatchObject({ "X-Tenant": "acme", accept: "*/*" })
    }
  })

  test("a same-origin redirect keeps the credential headers", async ({ tmpDir, expect }) => {
    const { requests, downloaded } = await download(tmpDir, { [FILE_URL]: SAME_ORIGIN_URL })

    expect(downloaded).toEqual(NEW)
    expect(requests.map(it => [it.url, it.headers.range])).toEqual([
      [FILE_URL, "bytes=0-15"],
      [SAME_ORIGIN_URL, "bytes=0-15"],
      [SAME_ORIGIN_URL, "bytes=32-47"],
    ])
    for (const { headers } of requests) {
      expect(headers).toHaveProperty("authorization", "Bearer feed-secret")
    }
  })

  test("a redirect loop fails the download", async ({ tmpDir, expect }) => {
    await expect(download(tmpDir, { [FILE_URL]: PRE_SIGNED_URL, [PRE_SIGNED_URL]: FILE_URL })).rejects.toThrow("Too many redirects (> 10)")
  })

  // The other range requests, each sent to the feed URL: a multi-range request (the default of the generic and custom providers), a
  // multi-range batch with only one range to download, and the read of the blockmap embedded in an AppImage or NSIS web installer.
  const META = `bytes=${NEW.length}-${withEmbeddedBlockMap(NEW).length - 1}`
  const paths: Array<{ name: string; scenario: Scenario; requests: Array<[string, string, string | undefined]> }> = [
    {
      name: "a multi-range request",
      scenario: { isUseMultipleRangeRequest: true },
      requests: [
        [FILE_URL, "bytes=0-15, 32-47", "Bearer feed-secret"],
        [PRE_SIGNED_URL, "bytes=0-15, 32-47", undefined],
      ],
    },
    {
      name: "the only range of a multi-range batch",
      scenario: { isUseMultipleRangeRequest: true, old: OLD_WITH_NEW_END },
      requests: [
        [FILE_URL, "bytes=0-15", "Bearer feed-secret"],
        [PRE_SIGNED_URL, "bytes=0-15", undefined],
      ],
    },
    {
      name: "the embedded blockmap read",
      scenario: { isEmbeddedBlockMap: true },
      // then the ranges, one per request
      requests: [
        [FILE_URL, META, "Bearer feed-secret"],
        [PRE_SIGNED_URL, META, undefined],
        [FILE_URL, "bytes=0-15", "Bearer feed-secret"],
        [PRE_SIGNED_URL, "bytes=0-15", undefined],
        [PRE_SIGNED_URL, "bytes=32-47", undefined],
      ],
    },
  ]
  for (const { name, scenario, requests: expectedRequests } of paths) {
    test(`${name} redirected to another origin gets no credential headers`, async ({ tmpDir, expect }) => {
      const { requests, downloaded, file } = await download(tmpDir, { [FILE_URL]: PRE_SIGNED_URL }, scenario)

      expect(downloaded).toEqual(file)
      expect(requests.map(it => [it.url, rangeOf(it.headers), it.headers.authorization])).toEqual(expectedRequests)
      for (const { headers } of requests) {
        expect(headers).toMatchObject({ "X-Tenant": "acme", accept: "*/*" })
        // the other credential headers go wherever authorization goes
        expect(headers["PRIVATE-TOKEN"]).toBe(headers.authorization == null ? undefined : "gitlab-secret")
      }
    })
  }

  test("a multi-range request redirected to a host that answers with the whole file is retried range by range", async ({ tmpDir, expect }) => {
    const { requests, abortedUrls, downloaded } = await download(tmpDir, { [FILE_URL]: PRE_SIGNED_URL }, { isUseMultipleRangeRequest: true, isMultipleRangeSupported: false })

    expect(downloaded).toEqual(NEW)
    expect(requests.map(it => [it.url, rangeOf(it.headers), it.headers.authorization])).toEqual([
      [FILE_URL, "bytes=0-15, 32-47", "Bearer feed-secret"],
      [PRE_SIGNED_URL, "bytes=0-15, 32-47", undefined],
      [FILE_URL, "bytes=0-15", "Bearer feed-secret"],
      [PRE_SIGNED_URL, "bytes=0-15", undefined],
      [PRE_SIGNED_URL, "bytes=32-47", undefined],
    ])
    // the requests left at each redirect, and the one that answered with the whole file (not the first one, already aborted)
    expect(abortedUrls).toEqual([FILE_URL, PRE_SIGNED_URL, FILE_URL])
  })
})
