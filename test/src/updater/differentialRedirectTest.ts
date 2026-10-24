import { BlockMap, CancellationToken } from "builder-util-runtime"
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

// The single-range differential download makes `redirect: "manual"` Electron net requests, and our Node test server never
// redirects, so the requests go to a fake net request here. Like ElectronHttpExecutor.download, a redirect must not send the
// credential headers to another origin.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const PRE_SIGNED_URL = "https://bucket.example.net/app-1.1.0.exe?X-Amz-Signature=abc"
const SAME_ORIGIN_URL = "https://feed.example.com/files/app-1.1.0.exe"

// three blocks; the middle one is unchanged, so the plan is: download bytes 0-15, copy 16-31 from the old file, download bytes 32-47
const BLOCK = 16
const OLD = Buffer.from("a".repeat(BLOCK) + "b".repeat(BLOCK) + "c".repeat(BLOCK))
const NEW = Buffer.from("x".repeat(BLOCK) + "b".repeat(BLOCK) + "z".repeat(BLOCK))

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

interface SentRequest {
  readonly url: string
  readonly headers: OutgoingHttpHeaders
}

// Stands in for Electron's net ClientRequest with `redirect: "manual"`: a redirect is reported as a "redirect" event, after
// which the request is either aborted or sent again by followRedirect() to the new URL, with the same headers.
class FakeNetRequest extends EventEmitter {
  private redirectUrl: string | null = null
  private redirectCount = 0

  constructor(
    private readonly executor: FakeElectronHttpExecutor,
    private url: string,
    private readonly headers: OutgoingHttpHeaders
  ) {
    super()
  }

  end(): void {
    this.send()
  }

  followRedirect(): void {
    this.url = this.redirectUrl!
    this.send()
  }

  abort(): void {
    this.redirectUrl = null
    this.emit("abort")
  }

  private send(): void {
    this.executor.requests.push({ url: this.url, headers: this.headers })
    setImmediate(() => {
      const location = this.executor.redirects[this.url]
      if (location != null) {
        // Chromium's limit
        if (++this.redirectCount > 20) {
          this.emit("error", new Error("net::ERR_TOO_MANY_REDIRECTS"))
          return
        }
        this.redirectUrl = location
        this.emit("redirect", 302, "GET", location)
        return
      }

      const [start, end] = /^bytes=(\d+)-(\d+)$/.exec(String(this.headers.range))!.slice(1).map(Number)
      const response = Object.assign(new PassThrough(), { statusCode: 206, headers: { "content-range": `bytes ${start}-${end}/${NEW.length}` } })
      this.emit("response", response)
      response.end(NEW.subarray(start, end + 1))
    })
  }
}

class FakeElectronHttpExecutor extends ElectronHttpExecutor {
  readonly requests: Array<SentRequest> = []

  constructor(readonly redirects: Record<string, string>) {
    super()
  }

  createRequest(options: RequestOptions, callback: (response: any) => void): any {
    const port = options.port == null ? "" : `:${options.port}`
    // like net.request, the headers are copied when the request is created
    const request = new FakeNetRequest(this, `${options.protocol}//${options.hostname}${port}${options.path}`, { ...options.headers })
    request.on("response", callback)
    return request
  }
}

describe("differential download redirects", () => {
  async function download(tmpDir: TmpDir, redirects: Record<string, string>) {
    const dir = await tmpDir.createTempDir({ prefix: "differential-redirect" })
    const oldFile = path.join(dir, "old.exe")
    const newFile = path.join(dir, "new.exe")
    await fsExtra.writeFile(oldFile, OLD)
    const executor = new FakeElectronHttpExecutor(redirects)
    const downloader = new GenericDifferentialDownloader({ size: NEW.length, sha512: createHash("sha512").update(NEW).digest("base64") }, executor, {
      newUrl: new URL(FILE_URL),
      oldFile,
      newFile,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      requestHeaders: { authorization: "Bearer feed-secret", "X-Tenant": "acme" },
      isUseMultipleRangeRequest: false,
      cancellationToken: new CancellationToken(),
    })
    await downloader.download(blockMapOf(OLD), blockMapOf(NEW))
    return { requests: executor.requests, downloaded: await fsExtra.readFile(newFile) }
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
})
