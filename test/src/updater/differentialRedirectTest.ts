import { BlockMapDataHolder, CancellationToken, ProgressInfo } from "builder-util-runtime"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { OutgoingHttpHeaders } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { describe, type ExpectStatic, test } from "vitest"
import { blockMapOf, FakeElectronHttpExecutor, FakeNetAnswer, FakeNetSentRequest } from "../helpers/updaterTestUtil.js"

// Differential downloads make `redirect: "manual"` Electron net requests, which go to a fake net request here (our Node test
// server never redirects). Like ElectronHttpExecutor.download, a redirect must not send the credential headers to another origin.

const FILE_URL = "https://feed.example.com/updates/app-1.1.0.exe"
const PRE_SIGNED_URL = "https://bucket.example.net/app-1.1.0.exe?X-Amz-Signature=abc"
const SAME_ORIGIN_URL = "https://feed.example.com/files/app-1.1.0.exe"

// three blocks; the middle one is unchanged, so the plan is: download bytes 0-15, copy 16-31 from the old file, download bytes 32-47
const BLOCK = 16
const OLD = Buffer.from("a".repeat(BLOCK) + "b".repeat(BLOCK) + "c".repeat(BLOCK))
const NEW = Buffer.from("x".repeat(BLOCK) + "b".repeat(BLOCK) + "z".repeat(BLOCK))

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
  await fsExtra.writeFile(oldFile, OLD)
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
    cancellationToken: new CancellationToken(),
    onProgress: it => progress.push(it),
  })
  await downloader.download(blockMapOf(OLD, BLOCK), blockMapOf(content, BLOCK))
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
      [PRE_SIGNED_URL, "bytes=32-47"],
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
      [SAME_ORIGIN_URL, "bytes=32-47"],
    ])
    for (const { headers } of sent) {
      expectCredentials(expect, headers, true)
    }
  })

  test("a redirect loop fails the download after 10 redirects", async ({ tmpDir, expect }) => {
    const c: DownloadCase = { redirects: { [FILE_URL]: PRE_SIGNED_URL, [PRE_SIGNED_URL]: FILE_URL } }
    const executor = createExecutor(c, NEW)
    await expect(download(tmpDir, c, executor)).rejects.toThrow("Too many redirects (> 10)")
    // the request and the 10 redirects it may follow
    expect(executor.sent).toHaveLength(11)
  })
})
