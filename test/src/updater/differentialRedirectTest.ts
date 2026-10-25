import { BlockMapDataHolder, CancellationError, CancellationToken, ProgressInfo } from "builder-util-runtime"
import { DifferentialDownloader } from "electron-updater/src/differentialDownloader/DifferentialDownloader"
import { DOWNLOAD_GAP_COALESCE_THRESHOLD, MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { MAX_RANGES_PER_REQUEST, requestRange } from "electron-updater/src/differentialDownloader/multipleRangeDownloader"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { OutgoingHttpHeaders } from "http"
import * as path from "path"
import { PassThrough } from "stream"
import type { TmpDir } from "temp-file"
import { describe, type ExpectStatic, test } from "vitest"
import { blockMapOf, FakeElectronHttpExecutor, FakeNetAnswer, FakeNetSentRequest } from "../helpers/updaterTestUtil.js"

// Differential downloads make `redirect: "manual"` Electron net requests, which go to a fake net request here (our Node test
// server never redirects). Like ElectronHttpExecutor.download, a redirect must not send the credential headers to another origin.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const PRE_SIGNED_URL = "https://bucket.example.net/app-1.1.0.exe?X-Amz-Signature=abc"
const SAME_ORIGIN_URL = "https://feed.example.com/files/app-1.1.0.exe"

// a changed block, an unchanged middle and a changed block, so the plan is: download the first block, copy the middle from the old file,
// download the last block. The middle is as large as the gap that is still downloaded rather than copied (on any host), so the two
// changed blocks stay two ranges.
const BLOCK = 16
const MIDDLE = DOWNLOAD_GAP_COALESCE_THRESHOLD
const OLD = Buffer.from("a".repeat(BLOCK) + "b".repeat(MIDDLE) + "c".repeat(BLOCK))
const NEW = Buffer.from("x".repeat(BLOCK) + "b".repeat(MIDDLE) + "z".repeat(BLOCK))
// only the first block changed: one range to download, which the multi-range downloader requests on its own
const NEW_FIRST_BLOCK = Buffer.from("x".repeat(BLOCK) + "b".repeat(MIDDLE) + "c".repeat(BLOCK))
const SECOND_START = BLOCK + MIDDLE
const SECOND_END = 2 * BLOCK + MIDDLE - 1
const SECOND_RANGE = `bytes=${SECOND_START}-${SECOND_END}`
const BOTH_RANGES = `bytes=0-15, ${SECOND_START}-${SECOND_END}`

const REQUEST_HEADERS: OutgoingHttpHeaders = {
  authorization: "Bearer feed-secret",
  "PRIVATE-TOKEN": "gitlab-secret",
  "X-Api-Key": "api-secret",
  Cookie: "session=secret",
  "X-Tenant": "acme",
}
const CREDENTIAL_HEADERS = ["authorization", "PRIVATE-TOKEN", "X-Api-Key", "Cookie"]

function parseRanges(header: unknown): Array<[number, number]> {
  return String(header)
    .replace(/^bytes=/, "")
    .split(",")
    .map(range => {
      const [start, end] = range.trim().split("-").map(Number)
      return [start, end]
    })
}

// a host that serves the ranges of `content`, several in one multipart/byteranges answer unless `multiRangeStatus` is set
function serveRanges(content: Buffer, headers: OutgoingHttpHeaders, multiRangeStatus?: number): FakeNetAnswer {
  const ranges = parseRanges(headers.range)
  if (ranges.length === 1) {
    const [start, end] = ranges[0]
    return { statusCode: 206, headers: { "content-range": `bytes ${start}-${end}/${content.length}` }, body: content.subarray(start, end + 1) }
  }
  if (multiRangeStatus != null) {
    return { statusCode: multiRangeStatus, body: Buffer.from("Multiple ranges are not supported") }
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
  readonly multiRangeStatus?: number
  readonly old?: Buffer
  readonly blockSize?: number
  readonly cancellationToken?: CancellationToken
}

function createExecutor(c: DownloadCase, content: Buffer): FakeElectronHttpExecutor {
  return new FakeElectronHttpExecutor((url, headers) => {
    const location = c.redirects[url]
    if (location != null && (c.redirectRanges == null || c.redirectRanges.includes(String(headers.range)))) {
      return { location }
    }
    return serveRanges(content, headers, c.multiRangeStatus)
  })
}

function createLogger(infos: Array<string>, warnings: Array<string>) {
  return { info: (message: unknown) => infos.push(String(message)), warn: (message: unknown) => warnings.push(String(message)), error: () => {} }
}

function fileInfoOf(content: Buffer): BlockMapDataHolder {
  return { size: content.length, sha512: createHash("sha512").update(content).digest("base64") }
}

async function download(tmpDir: TmpDir, c: DownloadCase, executor = createExecutor(c, c.content ?? NEW)) {
  const content = c.content ?? NEW
  const dir = await tmpDir.createTempDir({ prefix: "differential-redirect" })
  const oldFile = path.join(dir, "old.exe")
  const newFile = path.join(dir, "new.exe")
  const old = c.old ?? OLD
  const blockSize = c.blockSize ?? BLOCK
  await fsExtra.writeFile(oldFile, old)
  const infos: Array<string> = []
  const warnings: Array<string> = []
  const progress: Array<ProgressInfo> = []
  const downloader = new GenericDifferentialDownloader(fileInfoOf(content), executor, {
    newUrl: new URL(FILE_URL),
    oldFile,
    newFile,
    logger: createLogger(infos, warnings),
    requestHeaders: REQUEST_HEADERS,
    isUseMultipleRangeRequest: c.isUseMultipleRangeRequest === true,
    cancellationToken: c.cancellationToken ?? new CancellationToken(),
    onProgress: it => progress.push(it),
  })
  await downloader.download(blockMapOf(old, blockSize), blockMapOf(content, blockSize))
  return { sent: executor.sent, downloaded: await fsExtra.readFile(newFile), content, infos, warnings, progress }
}

function urlsAndRanges(sent: Array<FakeNetSentRequest>): Array<[string, unknown]> {
  return sent.map(it => [it.url, it.headers.range])
}

function expectCredentials(expect: ExpectStatic, headers: OutgoingHttpHeaders, isSent: boolean): void {
  for (const name of CREDENTIAL_HEADERS) {
    if (isSent) {
      expect(headers).toHaveProperty(name, REQUEST_HEADERS[name])
    } else {
      expect(headers).not.toHaveProperty(name)
    }
  }
  expect(headers).toMatchObject({ "X-Tenant": "acme", accept: "*/*" })
}

describe("differential download redirects", () => {
  test("a redirect to another origin gets no credential headers, and neither do the remaining ranges", async ({ tmpDir, expect }) => {
    const { sent, downloaded, infos } = await download(tmpDir, { redirects: { [FILE_URL]: PRE_SIGNED_URL } })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(sent)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, SECOND_RANGE],
    ])
    // positive control: the feed gets the credentials
    expectCredentials(expect, sent[0].headers, true)
    for (const { headers } of sent.slice(1)) {
      expectCredentials(expect, headers, false)
    }
    // the redirect is logged without the query, which holds the signature of a pre-signed URL
    expect(infos).toContain("Redirect to https://bucket.example.net/app-1.1.0.exe")
    expect(infos.join("\n")).not.toContain("Signature")
  })

  test("a same-origin redirect keeps the credential headers", async ({ tmpDir, expect }) => {
    const { sent, downloaded } = await download(tmpDir, { redirects: { [FILE_URL]: SAME_ORIGIN_URL } })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(sent)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [SAME_ORIGIN_URL, "bytes=0-15"],
      [SAME_ORIGIN_URL, SECOND_RANGE],
    ])
    for (const { headers } of sent) {
      expectCredentials(expect, headers, true)
    }
  })

  test("a redirect of a later range only moves the ranges from there on, and progress counts each range once", async ({ tmpDir, expect }) => {
    const { sent, downloaded, progress } = await download(tmpDir, { redirects: { [FILE_URL]: PRE_SIGNED_URL }, redirectRanges: [SECOND_RANGE] })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(sent)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [FILE_URL, SECOND_RANGE],
      [PRE_SIGNED_URL, SECOND_RANGE],
    ])
    expectCredentials(expect, sent[0].headers, true)
    expectCredentials(expect, sent[1].headers, true)
    expectCredentials(expect, sent[2].headers, false)
    expect(progress.length).toBeGreaterThan(0)
    expect(Math.max(...progress.map(it => it.transferred))).toBe(2 * BLOCK)
    expect(progress.every(it => it.total === 2 * BLOCK)).toBe(true)
  })

  test("a multi-range request redirected to another origin gets no credential headers", async ({ tmpDir, expect }) => {
    const { sent, downloaded } = await download(tmpDir, { redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest: true })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(sent)).toEqual([
      [FILE_URL, BOTH_RANGES],
      [PRE_SIGNED_URL, BOTH_RANGES],
    ])
    expectCredentials(expect, sent[0].headers, true)
    expectCredentials(expect, sent[1].headers, false)
  })

  test("a multi-range request redirected on the same origin keeps the credential headers", async ({ tmpDir, expect }) => {
    const { sent, downloaded } = await download(tmpDir, { redirects: { [FILE_URL]: SAME_ORIGIN_URL }, isUseMultipleRangeRequest: true })

    expect(downloaded).toEqual(NEW)
    expect(urlsAndRanges(sent)).toEqual([
      [FILE_URL, BOTH_RANGES],
      [SAME_ORIGIN_URL, BOTH_RANGES],
    ])
    for (const { headers } of sent) {
      expectCredentials(expect, headers, true)
    }
  })

  test("the lone range of a multi-range download, redirected to another origin, gets no credential headers", async ({ tmpDir, expect }) => {
    const { sent, downloaded } = await download(tmpDir, { redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest: true, content: NEW_FIRST_BLOCK })

    expect(downloaded).toEqual(NEW_FIRST_BLOCK)
    expect(urlsAndRanges(sent)).toEqual([
      [FILE_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=0-15"],
    ])
    expectCredentials(expect, sent[0].headers, true)
    expectCredentials(expect, sent[1].headers, false)
  })

  test("each multi-range batch and the lone range of a batch start at the update URL, so each gets its own redirect", async ({ tmpDir, expect }) => {
    // 2001 blocks, every other one changed: 1001 ranges to download and 1000 to copy. A block is as large as the gap that is still
    // copied on a multipart host, so the ranges are not coalesced. The multi-range downloader sends at most MAX_RANGES_PER_REQUEST ranges
    // per request: full batches, then one with the last range alone.
    const blockSize = MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD
    const blockCount = 2001
    const blocksOf = (marker: (index: number) => string) =>
      Buffer.from(Array.from({ length: blockCount }, (_, index) => marker(index) + String(index).padStart(blockSize - 1, "0")).join(""))
    const old = blocksOf(() => "o")
    const content = blocksOf(index => (index % 2 === 0 ? "n" : "o"))
    // a pre-signed URL can expire during a long download, so a later batch does not reuse it
    const { sent, downloaded } = await download(tmpDir, { redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest: true, content, old, blockSize })

    expect(downloaded).toEqual(content)
    const fullBatches = Math.floor(1001 / MAX_RANGES_PER_REQUEST)
    const expected: Array<[string, number]> = []
    for (let i = 0; i < fullBatches; i++) {
      expected.push([FILE_URL, MAX_RANGES_PER_REQUEST], [PRE_SIGNED_URL, MAX_RANGES_PER_REQUEST])
    }
    expected.push([FILE_URL, 1], [PRE_SIGNED_URL, 1])
    expect(sent.map(it => [it.url, parseRanges(it.headers.range).length])).toEqual(expected)
    expect(sent[2 * fullBatches].headers.range).toBe(`bytes=${2000 * blockSize}-${2001 * blockSize - 1}`)
    for (const { url, headers } of sent) {
      expectCredentials(expect, headers, url === FILE_URL)
    }
  })

  test("a redirect target that rejects multi-range requests is retried with one range per request", async ({ tmpDir, expect }) => {
    const { sent, downloaded, warnings } = await download(tmpDir, { redirects: { [FILE_URL]: PRE_SIGNED_URL }, isUseMultipleRangeRequest: true, multiRangeStatus: 501 })

    expect(downloaded).toEqual(NEW)
    expect(warnings.some(it => it.includes("retrying with one range per request"))).toBe(true)
    expect(urlsAndRanges(sent)).toEqual([
      [FILE_URL, BOTH_RANGES],
      [PRE_SIGNED_URL, BOTH_RANGES],
      [FILE_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, "bytes=0-15"],
      [PRE_SIGNED_URL, SECOND_RANGE],
    ])
    for (const { url, headers } of sent) {
      expectCredentials(expect, headers, url === FILE_URL)
    }
  })

  test("a redirect loop fails the download after 10 redirects", async ({ tmpDir, expect }) => {
    const c: DownloadCase = { redirects: { [FILE_URL]: PRE_SIGNED_URL, [PRE_SIGNED_URL]: FILE_URL } }
    const executor = createExecutor(c, NEW)
    await expect(download(tmpDir, c, executor)).rejects.toThrow("Too many redirects (> 10)")
    // the request and the 10 redirects it may follow
    expect(executor.sent).toHaveLength(11)
  })

  test("a redirect reported after a cancel is a cancellation, and the range is not requested again", async ({ tmpDir, expect }) => {
    const cancellationToken = new CancellationToken()
    const c: DownloadCase = { redirects: { [FILE_URL]: PRE_SIGNED_URL }, cancellationToken }
    // the cancel comes while the redirect is answered, so the redirect event is reported after it
    const executor = new FakeElectronHttpExecutor((url, headers) => {
      if (url === FILE_URL) {
        cancellationToken.cancel()
        return { location: PRE_SIGNED_URL }
      }
      return serveRanges(NEW, headers)
    })
    const error = await download(tmpDir, c, executor).then(
      () => null,
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(CancellationError)
    expect(urlsAndRanges(executor.sent)).toEqual([[FILE_URL, "bytes=0-15"]])
  })

  test("a redirect reported after the output stream was destroyed is not followed, and the range is not requested again", async ({ expect }) => {
    const out = new PassThrough()
    // a failure destroys the output while the redirect is answered, so the redirect event is reported after it
    const executor = new FakeElectronHttpExecutor((url, headers) => {
      if (url === FILE_URL) {
        out.destroy()
        return { location: PRE_SIGNED_URL }
      }
      return serveRanges(NEW, headers)
    })
    const downloader = new GenericDifferentialDownloader(fileInfoOf(NEW), executor, {
      newUrl: new URL(FILE_URL),
      oldFile: "unused",
      newFile: "unused",
      logger: createLogger([], []),
      requestHeaders: REQUEST_HEADERS,
      cancellationToken: new CancellationToken(),
    })
    const outcomes: Array<string> = []
    await new Promise<void>(resolve => {
      requestRange(
        downloader,
        { options: downloader.createRequestOptions() },
        "bytes=0-15",
        response => {
          outcomes.push(`response ${response.statusCode}`)
          resolve()
        },
        error => {
          outcomes.push(`rejected: ${error.message}`)
          resolve()
        },
        out
      )
    })
    // a request sent anyway would have been answered by now
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(outcomes).toEqual(["rejected: Cannot request a range: the output stream is destroyed"])
    expect(urlsAndRanges(executor.sent)).toEqual([[FILE_URL, "bytes=0-15"]])
  })
})

// FileWithEmbeddedBlockMapDifferentialDownloader reads the block map at the end of the new file with readRemoteBytes
class RemoteBytesReader extends DifferentialDownloader {
  read(start: number, endInclusive: number): Promise<Buffer> {
    return this.readRemoteBytes(start, endInclusive)
  }
}

describe("differential download redirects when reading remote bytes", () => {
  for (const [label, target, isSent] of [
    ["another origin gets no credential headers", PRE_SIGNED_URL, false],
    ["the same origin keeps the credential headers", SAME_ORIGIN_URL, true],
  ] as const) {
    test(`a redirect to ${label}`, async ({ expect }) => {
      const executor = createExecutor({ redirects: { [FILE_URL]: target } }, NEW)
      const reader = new RemoteBytesReader(fileInfoOf(NEW), executor, {
        newUrl: new URL(FILE_URL),
        oldFile: "unused",
        newFile: "unused",
        logger: createLogger([], []),
        requestHeaders: REQUEST_HEADERS,
        cancellationToken: new CancellationToken(),
      })

      expect(await reader.read(SECOND_START, SECOND_END)).toEqual(NEW.subarray(SECOND_START, SECOND_END + 1))
      expect(urlsAndRanges(executor.sent)).toEqual([
        [FILE_URL, SECOND_RANGE],
        [target, SECOND_RANGE],
      ])
      expectCredentials(expect, executor.sent[0].headers, true)
      expectCredentials(expect, executor.sent[1].headers, isSent)
    })
  }
})
