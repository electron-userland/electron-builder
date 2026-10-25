import { TmpDir } from "builder-util/out/util"
import { BlockMap, BlockMapDataHolder, CancellationToken } from "builder-util-runtime"
import { DifferentialDownloader } from "electron-updater/src/differentialDownloader/DifferentialDownloader"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { ElectronHttpExecutor } from "electron-updater/src/electronHttpExecutor"
import { createHash } from "crypto"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import type { OutgoingHttpHeaders, RequestOptions } from "http"
import * as path from "path"
import { PassThrough } from "stream"
import { afterEach, describe, expect, test } from "vitest"

// Differential downloads make `redirect: "manual"` Electron net requests, which go to a fake net request here (our Node test
// server never redirects). Like ElectronHttpExecutor.download, a redirect must not send the credential headers to another origin.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const PRE_SIGNED_URL = "https://bucket.example.net/app-1.1.0.exe?X-Amz-Signature=abc"
const SAME_ORIGIN_URL = "https://feed.example.com/files/app-1.1.0.exe"
const FTP_URL = "ftp://files.example.net/app-1.1.0.exe"

// three blocks; the middle one is unchanged, so the plan is: download bytes 0-15, copy 16-31 from the old file, download bytes 32-47
const BLOCK = 16
const OLD = Buffer.from("a".repeat(BLOCK) + "b".repeat(BLOCK) + "c".repeat(BLOCK))
const NEW = Buffer.from("x".repeat(BLOCK) + "b".repeat(BLOCK) + "z".repeat(BLOCK))
// only the first block changed: one range to download, which the multi-range downloader requests on its own
const NEW_FIRST_BLOCK = Buffer.from("x".repeat(BLOCK) + "b".repeat(BLOCK) + "c".repeat(BLOCK))

const REQUEST_HEADERS: OutgoingHttpHeaders = {
  authorization: "Bearer feed-secret",
  "PRIVATE-TOKEN": "gitlab-secret",
  "X-Api-Key": "api-secret",
  Cookie: "session=secret",
  "X-Tenant": "acme",
}
const CREDENTIAL_HEADERS = ["authorization", "PRIVATE-TOKEN", "X-Api-Key", "Cookie"]

function blockMapOf(data: Buffer, blockSize = BLOCK): BlockMap {
  const checksums: Array<string> = []
  const sizes: Array<number> = []
  for (let i = 0; i < data.length; i += blockSize) {
    const block = data.subarray(i, i + blockSize)
    checksums.push(createHash("sha256").update(block).digest("base64"))
    sizes.push(block.length)
  }
  return { version: "2", files: [{ name: "file", offset: 0, checksums, sizes }] }
}

function fileInfoOf(content: Buffer): BlockMapDataHolder {
  return { size: content.length, sha512: createHash("sha512").update(content).digest("base64") }
}

interface SentRequest {
  readonly url: string
  readonly headers: OutgoingHttpHeaders
}

/** How the fake host answers a request: with a redirect, or with a response. */
type FakeNetAnswer =
  | { readonly location: string }
  // `responseError` is emitted on the response once it was handled, as Electron's net does for a failure after the headers
  | { readonly statusCode: number; readonly headers?: Record<string, string>; readonly body?: Buffer; readonly responseError?: Error }

// Stands in for Electron's net ClientRequest. A redirect is reported as a "redirect" event: with `redirect: "manual"` the request
// is then cancelled unless followRedirect() was called during the event, with "follow" (the default) it goes on to the new URL,
// with the same headers, unless it was aborted.
class FakeNetRequest extends EventEmitter {
  private aborted = false
  private redirectCount = 0
  private isFollowRedirectCalled = false

  constructor(
    private readonly executor: FakeElectronHttpExecutor,
    private url: string,
    private readonly headers: OutgoingHttpHeaders,
    private readonly redirect: string
  ) {
    super()
  }

  end(): void {
    this.send()
  }

  followRedirect(): void {
    this.isFollowRedirectCalled = true
  }

  abort(): void {
    if (!this.aborted) {
      this.aborted = true
      this.emit("abort")
    }
  }

  private send(): void {
    this.executor.requests.push({ url: this.url, headers: this.headers })
    setImmediate(() => {
      if (this.aborted) {
        return
      }
      const answer = this.executor.answer(this.url, this.headers)
      if ("location" in answer) {
        // Chromium's limit
        if (++this.redirectCount > 20) {
          this.emit("error", new Error("net::ERR_TOO_MANY_REDIRECTS"))
          return
        }
        this.isFollowRedirectCalled = false
        this.emit("redirect", 302, "GET", answer.location, {})
        if (this.aborted) {
          return
        }
        if (this.redirect === "manual" && !this.isFollowRedirectCalled) {
          this.emit("error", new Error("Redirect was cancelled"))
          return
        }
        this.url = answer.location
        this.send()
        return
      }
      const response = Object.assign(new PassThrough(), { statusCode: answer.statusCode, headers: answer.headers ?? {} })
      this.executor.responses.push(response)
      this.emit("response", response)
      if (!response.destroyed) {
        response.end(answer.body)
      }
      if (answer.responseError != null) {
        // an `error` event without a listener throws, which in the main process is an uncaught exception
        try {
          response.emit("error", answer.responseError)
        } catch (e: unknown) {
          this.executor.unhandledResponseErrors.push(e)
        }
      }
    })
  }
}

class FakeElectronHttpExecutor extends ElectronHttpExecutor {
  readonly requests: Array<SentRequest> = []
  readonly responses: Array<PassThrough> = []
  readonly unhandledResponseErrors: Array<unknown> = []
  // createRequest throws for these URLs, as net.request does for options it cannot make a request of
  readonly unrequestableUrls = new Set<string>()

  constructor(readonly answer: (url: string, headers: OutgoingHttpHeaders) => FakeNetAnswer) {
    super()
  }

  // the return type of the overridden method is Electron's ClientRequest, which the fake does not implement
  createRequest(options: RequestOptions, callback: (response: any) => void): any {
    // like ElectronHttpExecutor.createRequest: a `Host` header is moved to `host`
    if (options.headers != null && options.headers.Host != null) {
      options.host = String(options.headers.Host)
      delete options.headers.Host
    }
    // like net.request: `host` wins over `hostname` and `port`
    const host = options.host ?? `${options.hostname}${options.port == null ? "" : `:${options.port}`}`
    const redirect = "redirect" in options && typeof options.redirect === "string" ? options.redirect : "follow"
    const url = `${options.protocol}//${host}${options.path}`
    // like net.request, which throws (rather than failing the request) for a protocol other than http: and https:
    if (options.protocol !== "http:" && options.protocol !== "https:") {
      throw new Error(`Protocol "${options.protocol}" not supported`)
    }
    if (this.unrequestableUrls.has(url)) {
      throw new Error(`Cannot create a request for ${url}`)
    }
    // like net.request, the headers are copied when the request is created
    const request = new FakeNetRequest(this, url, { ...options.headers }, redirect)
    request.on("response", callback)
    return request
  }
}

function parseRanges(header: unknown): Array<[number, number]> {
  return String(header)
    .replace(/^bytes=/, "")
    .split(",")
    .map(range => {
      const [start, end] = range.trim().split("-").map(Number)
      return [start, end]
    })
}

// a host that serves the ranges of `content`, several in one multipart/byteranges answer
function serveRanges(content: Buffer, headers: OutgoingHttpHeaders): FakeNetAnswer {
  const ranges = parseRanges(headers.range)
  if (ranges.length === 1) {
    const [start, end] = ranges[0]
    return { statusCode: 206, headers: { "content-range": `bytes ${start}-${end}/${content.length}` }, body: content.subarray(start, end + 1) }
  }
  const boundary = "test-boundary"
  const parts = ranges.map(([start, end]) =>
    Buffer.concat([
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${content.length}\r\n\r\n`),
      content.subarray(start, end + 1),
    ])
  )
  return { statusCode: 206, headers: { "content-type": `multipart/byteranges; boundary=${boundary}` }, body: Buffer.concat([...parts, Buffer.from(`\r\n--${boundary}--\r\n`)]) }
}

interface DownloadCase {
  readonly redirects: Record<string, string>
  readonly isUseMultipleRangeRequest?: boolean
  readonly content?: Buffer
  // a redirect for these ranges only
  readonly redirectRanges?: Array<string>
  readonly old?: Buffer
  readonly blockSize?: number
  readonly requestHeaders?: OutgoingHttpHeaders
  readonly logInfo?: (message: string) => void
}

function createExecutor(c: DownloadCase, content: Buffer): FakeElectronHttpExecutor {
  return new FakeElectronHttpExecutor((url, headers) => {
    const location = c.redirects[url]
    if (location != null && (c.redirectRanges == null || c.redirectRanges.includes(String(headers.range)))) {
      return { location }
    }
    return serveRanges(content, headers)
  })
}

function createLogger(infos: Array<string>, logInfo?: (message: string) => void) {
  return {
    info: (message: unknown) => {
      infos.push(String(message))
      logInfo?.(String(message))
    },
    warn: () => {},
    error: () => {},
  }
}

function urlsAndRanges(requests: Array<SentRequest>): Array<[string, unknown]> {
  return requests.map(it => [it.url, it.headers.range])
}

function expectCredentials(headers: OutgoingHttpHeaders, isSent: boolean): void {
  for (const name of CREDENTIAL_HEADERS) {
    if (isSent) {
      expect(headers).toHaveProperty(name, REQUEST_HEADERS[name])
    } else {
      expect(headers).not.toHaveProperty(name)
    }
  }
  expect(headers).toMatchObject({ "X-Tenant": "acme", accept: "*/*" })
}

// a host that rejects every request, and then fails the response it rejected
function rejectingExecutor(answer: { readonly statusCode: number; readonly headers?: Record<string, string> }): FakeElectronHttpExecutor {
  return new FakeElectronHttpExecutor(() => ({ ...answer, body: Buffer.from("rejected"), responseError: new Error("net::ERR_CONNECTION_RESET") }))
}

// the rejection is the reason the response was rejected (the later response error does not replace it), and the rejected
// response was destroyed without an unhandled `error` event
function expectRejectedResponsesReleased(executor: FakeElectronHttpExecutor): void {
  expect(executor.unhandledResponseErrors).toEqual([])
  expect(executor.responses.length).toBeGreaterThan(0)
  for (const response of executor.responses) {
    expect(response.destroyed).toBe(true)
  }
}

const REJECTED_ANSWERS = [
  ["a 403", { statusCode: 403 }, /^403 /],
  ["a 416", { statusCode: 416 }, /^416 /],
  ["a 200 without Accept-Ranges", { statusCode: 200 }, "Server doesn't support Accept-Ranges (response code 200)"],
] as const

describe("differential download redirects", () => {
  const tmpDir = new TmpDir("differential-redirect")
  afterEach(() => tmpDir.cleanup())

  async function download(c: DownloadCase, executor = createExecutor(c, c.content ?? NEW)) {
    const content = c.content ?? NEW
    const dir = await tmpDir.createTempDir({ prefix: "differential-redirect" })
    const oldFile = path.join(dir, "old.exe")
    const newFile = path.join(dir, "new.exe")
    const old = c.old ?? OLD
    const blockSize = c.blockSize ?? BLOCK
    await fsExtra.writeFile(oldFile, old)
    const infos: Array<string> = []
    const downloader = new GenericDifferentialDownloader(fileInfoOf(content), executor, {
      newUrl: new URL(FILE_URL),
      oldFile,
      newFile,
      logger: createLogger(infos, c.logInfo),
      requestHeaders: c.requestHeaders ?? REQUEST_HEADERS,
      isUseMultipleRangeRequest: c.isUseMultipleRangeRequest === true,
      cancellationToken: new CancellationToken(),
    })
    await downloader.download(blockMapOf(old, blockSize), blockMapOf(content, blockSize))
    return { requests: executor.requests, downloaded: await fsExtra.readFile(newFile), infos }
  }

  test("a redirect to another origin gets no credential headers, and neither do the remaining ranges", async () => {
    const { requests, downloaded, infos } = await download({ redirects: { [FILE_URL]: PRE_SIGNED_URL } })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(requests)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=32-47"],
    ])
    // positive control: the feed gets the credentials
    expectCredentials(requests[0].headers, true)
    for (const { headers } of requests.slice(1)) {
      expectCredentials(headers, false)
    }
    // the redirect is logged without the query, which holds the signature of a pre-signed URL
    expect(infos).toContain("Redirect to https://bucket.example.net/app-1.1.0.exe")
    expect(infos.join("\n")).not.toContain("Signature")
  })

  test("a same-origin redirect keeps the credential headers", async () => {
    const { requests, downloaded } = await download({ redirects: { [FILE_URL]: SAME_ORIGIN_URL } })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(requests)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [SAME_ORIGIN_URL, "bytes=0-15"],
      [SAME_ORIGIN_URL, "bytes=32-47"],
    ])
    for (const { headers } of requests) {
      expectCredentials(headers, true)
    }
  })

  test("a redirect of a later range only moves the ranges from there on", async () => {
    const { requests, downloaded } = await download({ redirects: { [FILE_URL]: PRE_SIGNED_URL }, redirectRanges: ["bytes=32-47"] })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(requests)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [FILE_URL, "bytes=32-47"],
      [PRE_SIGNED_URL, "bytes=32-47"],
    ])
    expectCredentials(requests[0].headers, true)
    expectCredentials(requests[1].headers, true)
    expectCredentials(requests[2].headers, false)
  })

  // ElectronHttpExecutor.createRequest moves a `Host` header to `host`, which Electron's net prefers over hostname and port
  for (const isUseMultipleRangeRequest of [false, true]) {
    test(`a ${isUseMultipleRangeRequest ? "multi" : "single"}-range request with a Host header is redirected to the redirect target`, async () => {
      const { requests, downloaded } = await download({
        redirects: { [FILE_URL]: PRE_SIGNED_URL },
        isUseMultipleRangeRequest,
        requestHeaders: { ...REQUEST_HEADERS, Host: "feed.example.com" },
      })

      expect(downloaded).toEqual(NEW)
      expect(requests.map(it => it.url)).toEqual(isUseMultipleRangeRequest ? [FILE_URL, PRE_SIGNED_URL] : [FILE_URL, PRE_SIGNED_URL, PRE_SIGNED_URL])
      expectCredentials(requests[0].headers, true)
      for (const { headers } of requests.slice(1)) {
        expectCredentials(headers, false)
      }
    })
  }

  test("a multi-range request redirected to another origin gets no credential headers", async () => {
    const { requests, downloaded } = await download({ redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest: true })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(requests)).toEqual([
      [FILE_URL, "bytes=0-15, 32-47"],
      [PRE_SIGNED_URL, "bytes=0-15, 32-47"],
    ])
    expectCredentials(requests[0].headers, true)
    expectCredentials(requests[1].headers, false)
  })

  test("a multi-range request redirected on the same origin keeps the credential headers", async () => {
    const { requests, downloaded } = await download({ redirects: { [FILE_URL]: SAME_ORIGIN_URL }, isUseMultipleRangeRequest: true })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(requests)).toEqual([
      [FILE_URL, "bytes=0-15, 32-47"],
      [SAME_ORIGIN_URL, "bytes=0-15, 32-47"],
    ])
    for (const { headers } of requests) {
      expectCredentials(headers, true)
    }
  })

  test("the lone range of a multi-range download, redirected to another origin, gets no credential headers", async () => {
    const { requests, downloaded } = await download({ redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest: true, content: NEW_FIRST_BLOCK })

    expect(downloaded).toEqual(NEW_FIRST_BLOCK)
    expect(urlsAndRanges(requests)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=0-15"],
    ])
    expectCredentials(requests[0].headers, true)
    expectCredentials(requests[1].headers, false)
  })

  test("each multi-range batch and the lone range of a batch start at the update URL, so each gets its own redirect", async () => {
    // 2001 blocks, every other one changed: 1001 ranges to download and 1000 to copy. The multi-range downloader sends the
    // operations in batches of 1000: two of 500 ranges, then one with the last range alone.
    const blockSize = 8
    const blockCount = 2001
    const blocksOf = (marker: (index: number) => string) =>
      Buffer.from(Array.from({ length: blockCount }, (_, index) => marker(index) + String(index).padStart(blockSize - 1, "0")).join(""))
    const old = blocksOf(() => "o")
    const content = blocksOf(index => (index % 2 === 0 ? "n" : "o"))
    // a pre-signed URL can expire during a long download, so a later batch does not reuse it
    const { requests, downloaded } = await download({ redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest: true, content, old, blockSize })

    expect(downloaded).toEqual(content)
    expect(requests.map(it => [it.url, parseRanges(it.headers.range).length])).toEqual([
      [FILE_URL, 500],
      [PRE_SIGNED_URL, 500],
      [FILE_URL, 500],
      [PRE_SIGNED_URL, 500],
      [FILE_URL, 1],
      [PRE_SIGNED_URL, 1],
    ])
    expect(requests[4].headers.range).toBe(`bytes=${2000 * blockSize}-${2001 * blockSize - 1}`)
    for (const { url, headers } of requests) {
      expectCredentials(headers, url === FILE_URL)
    }
  })

  // a redirect handler that throws (an invalid URL, a failing logger) used to leave the download waiting forever
  const GUARD_TIMEOUT = 10_000

  for (const isUseMultipleRangeRequest of [false, true]) {
    const label = isUseMultipleRangeRequest ? "multi" : "single"

    test(
      `a redirect loop fails a ${label}-range download after 10 redirects`,
      async () => {
        const c: DownloadCase = { redirects: { [FILE_URL]: PRE_SIGNED_URL, [PRE_SIGNED_URL]: FILE_URL }, isUseMultipleRangeRequest }
        const executor = createExecutor(c, NEW)
        await expect(download(c, executor)).rejects.toThrow("Too many redirects (> 10)")
        // the request and the 10 redirects it may follow
        expect(executor.requests).toHaveLength(11)
      },
      GUARD_TIMEOUT
    )

    test(
      `an invalid redirect URL fails a ${label}-range download`,
      async () => {
        const c: DownloadCase = { redirects: { [FILE_URL]: "https://[invalid/app.exe" }, isUseMultipleRangeRequest }
        const executor = createExecutor(c, NEW)
        await expect(download(c, executor)).rejects.toThrow("Invalid URL")
        expect(executor.requests).toHaveLength(1)
      },
      GUARD_TIMEOUT
    )

    test(
      `a redirect to a protocol other than http(s) fails a ${label}-range download`,
      async () => {
        const c: DownloadCase = { redirects: { [FILE_URL]: FTP_URL }, isUseMultipleRangeRequest }
        const executor = createExecutor(c, NEW)
        await expect(download(c, executor)).rejects.toThrow('Cannot follow the redirect to the "ftp:" protocol')
        expect(executor.requests).toHaveLength(1)
      },
      GUARD_TIMEOUT
    )

    test(
      `a redirect target that no request can be created for fails a ${label}-range download`,
      async () => {
        const c: DownloadCase = { redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest }
        const executor = createExecutor(c, NEW)
        executor.unrequestableUrls.add(PRE_SIGNED_URL)
        await expect(download(c, executor)).rejects.toThrow(`Cannot create a request for ${PRE_SIGNED_URL}`)
        expect(executor.requests).toHaveLength(1)
      },
      GUARD_TIMEOUT
    )

    test(
      `a logger that throws on the redirect does not fail a ${label}-range download`,
      async () => {
        const { requests, downloaded } = await download({
          redirects: { [FILE_URL]: PRE_SIGNED_URL },
          isUseMultipleRangeRequest,
          logInfo: message => {
            if (message.startsWith("Redirect to")) {
              throw new Error("logger failure")
            }
          },
        })

        expect(downloaded).toEqual(NEW)
        expect(requests[1].url).toBe(PRE_SIGNED_URL)
        expectCredentials(requests[1].headers, false)
      },
      GUARD_TIMEOUT
    )
  }

  for (const [label, answer, message] of REJECTED_ANSWERS) {
    for (const [kind, isUseMultipleRangeRequest, content] of [
      ["a multi-range batch", true, NEW],
      ["the lone range of a multi-range download", true, NEW_FIRST_BLOCK],
      ["a single-range download", false, NEW],
    ] as const) {
      // the range-by-range download checks the status only: a full answer fails the sha512 check of the new file
      if (!isUseMultipleRangeRequest && answer.statusCode < 400) {
        continue
      }
      test(
        `${label} that then fails rejects ${kind} without an unhandled response error`,
        async () => {
          const executor = rejectingExecutor(answer)
          await expect(download({ redirects: {}, isUseMultipleRangeRequest, content }, executor)).rejects.toThrow(message)
          expectRejectedResponsesReleased(executor)
          // the download stops at the rejected range
          expect(executor.requests).toHaveLength(1)
        },
        GUARD_TIMEOUT
      )
    }
  }

  test(
    "a multi-range answer that is not multipart and then fails rejects the batch without an unhandled response error",
    async () => {
      const executor = rejectingExecutor({ statusCode: 206, headers: { "content-type": "application/octet-stream" } })
      await expect(download({ redirects: {}, isUseMultipleRangeRequest: true }, executor)).rejects.toThrow(
        'Content-Type "multipart/byteranges" is expected, but got "application/octet-stream"'
      )
      expectRejectedResponsesReleased(executor)
      expect(executor.requests).toHaveLength(1)
    },
    GUARD_TIMEOUT
  )
})

// FileWithEmbeddedBlockMapDifferentialDownloader reads the block map at the end of the new file with readRemoteBytes
class RemoteBytesReader extends DifferentialDownloader {
  read(start: number, endInclusive: number): Promise<Buffer> {
    return this.readRemoteBytes(start, endInclusive)
  }
}

describe("differential download redirects when reading remote bytes", () => {
  function createReader(executor: FakeElectronHttpExecutor): RemoteBytesReader {
    return new RemoteBytesReader(fileInfoOf(NEW), executor, {
      newUrl: new URL(FILE_URL),
      oldFile: "unused",
      newFile: "unused",
      logger: createLogger([]),
      requestHeaders: REQUEST_HEADERS,
      cancellationToken: new CancellationToken(),
    })
  }

  for (const [label, target, isSent] of [
    ["another origin gets no credential headers", PRE_SIGNED_URL, false],
    ["the same origin keeps the credential headers", SAME_ORIGIN_URL, true],
  ] as const) {
    test(`a redirect to ${label}`, async () => {
      const executor = createExecutor({ redirects: { [FILE_URL]: target } }, NEW)

      expect(await createReader(executor).read(32, 47)).toEqual(NEW.subarray(32, 48))
      expect(urlsAndRanges(executor.requests)).toEqual([
        [FILE_URL, "bytes=32-47"],
        [target, "bytes=32-47"],
      ])
      expectCredentials(executor.requests[0].headers, true)
      expectCredentials(executor.requests[1].headers, isSent)
    })
  }

  test("a redirect loop fails after 10 redirects", async () => {
    const executor = createExecutor({ redirects: { [FILE_URL]: PRE_SIGNED_URL, [PRE_SIGNED_URL]: FILE_URL } }, NEW)
    await expect(createReader(executor).read(32, 47)).rejects.toThrow("Too many redirects (> 10)")
    expect(executor.requests).toHaveLength(11)
  })

  test("a redirect to a protocol other than http(s) fails", async () => {
    const executor = createExecutor({ redirects: { [FILE_URL]: FTP_URL } }, NEW)
    await expect(createReader(executor).read(32, 47)).rejects.toThrow('Cannot follow the redirect to the "ftp:" protocol')
    expect(executor.requests).toHaveLength(1)
  }, 10_000)

  for (const [label, answer, message] of REJECTED_ANSWERS) {
    test(`${label} that then fails rejects without an unhandled response error`, async () => {
      const executor = rejectingExecutor(answer)
      await expect(createReader(executor).read(32, 47)).rejects.toThrow(message)
      expectRejectedResponsesReleased(executor)
      expect(executor.requests).toHaveLength(1)
    })
  }
})
