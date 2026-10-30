import { CancellationToken, HttpExecutor, ProgressInfo } from "builder-util-runtime"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { READ_AHEAD_MAX_RANGE_BYTES, SINGLE_RANGE_CONCURRENCY } from "electron-updater/src/differentialDownloader/singleRangeReadAhead"
import { createHash } from "crypto"
import { readFileSync, writeFileSync } from "fs"
import { ClientRequest, createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from "http"
import { AddressInfo } from "net"
import * as path from "path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { blockMap, FakeElectronHttpExecutor } from "../helpers/updaterTestUtil.js"

// Plain node:http, so the sandbox's HTTP_PROXY settings (honoured by NodeHttpExecutor) cannot route 127.0.0.1 through a proxy.
class LocalHttpExecutor extends HttpExecutor<ClientRequest> {
  createRequest(options: any, callback: (response: any) => void): ClientRequest {
    return httpRequest(options, callback)
  }
}

const BLOCK = 4096
const LATENCY_MS = 30

function bytes(size: number, seed: number): Buffer {
  const buffer = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    buffer[i] = x >> 16
  }
  return buffer
}

interface Layout {
  oldContent: Buffer
  newContent: Buffer
  oldNames: Array<string>
  newNames: Array<string>
  sizes: Array<number>
}

/**
 * `changes` changed blocks of the given sizes, each followed by three unchanged 4 KiB blocks (a 12 KiB COPY: more than the
 * 8 KiB the plan downloads through), so the plan has one DOWNLOAD range per change.
 */
function layout(changeSizes: Array<number>): Layout {
  const result: Layout = { oldContent: Buffer.alloc(0), newContent: Buffer.alloc(0), oldNames: [], newNames: [], sizes: [] }
  const oldParts: Array<Buffer> = []
  const newParts: Array<Buffer> = []
  changeSizes.forEach((size, i) => {
    oldParts.push(bytes(size, 1000 + i))
    newParts.push(bytes(size, 2000 + i))
    result.oldNames.push(`old-${i}`)
    result.newNames.push(`new-${i}`)
    result.sizes.push(size)
    for (let k = 0; k < 3; k++) {
      const shared = bytes(BLOCK, 3000 + i * 3 + k)
      oldParts.push(shared)
      newParts.push(shared)
      result.oldNames.push(`shared-${i}-${k}`)
      result.newNames.push(`shared-${i}-${k}`)
      result.sizes.push(BLOCK)
    }
  })
  result.oldContent = Buffer.concat(oldParts)
  result.newContent = Buffer.concat(newParts)
  return result
}

interface Exchange {
  path: string
  range: string
  arrived: number
  answered: number
}

describe("single-range host: DOWNLOAD ranges are read ahead", { concurrent: false }, () => {
  let server: Server | null = null
  let exchanges: Array<Exchange> = []
  let maxInFlight = 0
  /** answers the n-th request (1-based) instead of the file server when it returns true */
  let override: ((n: number, res: ServerResponse) => boolean) | null = null
  let latencyMs = LATENCY_MS

  afterEach(async () => {
    override = null
    latencyMs = LATENCY_MS
    if (server != null) {
      server.closeAllConnections()
      await new Promise<void>(resolve => server!.close(() => resolve()))
      server = null
    }
  })

  async function startHost(content: Buffer): Promise<URL> {
    exchanges = []
    maxInFlight = 0
    let inFlight = 0
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const exchange: Exchange = { path: req.url!, range: req.headers.range ?? "", arrived: performance.now(), answered: Infinity }
      exchanges.push(exchange)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      res.on("close", () => {
        inFlight--
        exchange.answered = performance.now()
      })
      if (override?.(exchanges.length, res) === true) {
        return
      }
      const [start, end] = exchange.range.slice("bytes=".length).split("-").map(Number)
      setTimeout(() => {
        res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${content.length}`, "Content-Length": end - start + 1 })
        res.end(content.subarray(start, end + 1))
      }, latencyMs)
    })
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve))
    return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/new.bin`)
  }

  async function download(
    dir: string,
    files: Layout,
    newUrl: URL,
    onProgress?: (info: ProgressInfo) => void,
    httpExecutor: HttpExecutor<any> = new LocalHttpExecutor()
  ): Promise<string> {
    const oldFile = path.join(dir, "old.bin")
    const newFile = path.join(dir, "new.bin")
    writeFileSync(oldFile, files.oldContent)
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const fileInfo = { size: files.newContent.length, sha512: createHash("sha512").update(files.newContent).digest("base64") }
    const downloader = new GenericDifferentialDownloader(fileInfo, httpExecutor, {
      oldFile,
      newFile,
      newUrl,
      logger,
      requestHeaders: null,
      isUseMultipleRangeRequest: false,
      cancellationToken: new CancellationToken(),
      onProgress,
    })
    await downloader.download(blockMap(files.oldNames, files.sizes), blockMap(files.newNames, files.sizes))
    return newFile
  }

  test("one request until the first answer, then up to SINGLE_RANGE_CONCURRENCY at a time; the file is reassembled in order", async ({ tmpDir }) => {
    const files = layout(new Array(20).fill(BLOCK))
    const newFile = await download(await tmpDir.createTempDir({ prefix: "read-ahead" }), files, await startHost(files.newContent))
    expect(readFileSync(newFile).equals(files.newContent)).toBe(true)
    expect(exchanges).toHaveLength(20)
    expect(exchanges.every(it => !it.range.includes(","))).toBe(true)
    expect(maxInFlight).toBe(SINGLE_RANGE_CONCURRENCY)
    // the second request waited for the first answer; the requests are sent in plan order
    expect(exchanges[1].arrived).toBeGreaterThanOrEqual(exchanges[0].answered - 1)
    const starts = exchanges.map(it => parseInt(it.range.slice("bytes=".length), 10))
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  test("a range longer than READ_AHEAD_MAX_RANGE_BYTES is streamed when the writer reaches it, while the ranges after it are read ahead", async ({ tmpDir }) => {
    const files = layout([BLOCK, READ_AHEAD_MAX_RANGE_BYTES + BLOCK, BLOCK, BLOCK, BLOCK, BLOCK])
    const newFile = await download(await tmpDir.createTempDir({ prefix: "read-ahead" }), files, await startHost(files.newContent))
    expect(readFileSync(newFile).equals(files.newContent)).toBe(true)
    expect(exchanges).toHaveLength(6)
    expect(maxInFlight).toBeLessThanOrEqual(SINGLE_RANGE_CONCURRENCY)
    const long = exchanges[1]
    expect(long.range).toBe(`bytes=${4 * BLOCK}-${5 * BLOCK + READ_AHEAD_MAX_RANGE_BYTES - 1}`)
    // the next ranges, one slot fewer than SINGLE_RANGE_CONCURRENCY (the long range takes one), were requested before it was answered
    const ahead = exchanges.slice(2, 2 + SINGLE_RANGE_CONCURRENCY - 1)
    expect(ahead).toHaveLength(SINGLE_RANGE_CONCURRENCY - 1)
    expect(ahead.every(it => it.arrived < long.answered)).toBe(true)
  })

  test("a failed read-ahead request fails the download and aborts the requests in flight", async ({ tmpDir }) => {
    const files = layout(new Array(12).fill(BLOCK))
    let isHungClosed = false
    latencyMs = 300
    override = (n, res) => {
      if (n === 3) {
        // while the other requests of the wave are in flight
        setTimeout(() => {
          res.writeHead(500)
          res.end("boom")
        }, 50)
        return true
      }
      if (n === 4) {
        // never answered: only an abort ends it
        res.on("close", () => (isHungClosed = true))
        return true
      }
      return false
    }
    await expect(download(await tmpDir.createTempDir({ prefix: "read-ahead" }), files, await startHost(files.newContent))).rejects.toThrow(/500/)
    await vi.waitFor(() => expect(isHungClosed).toBe(true))
    // the first request alone, then one wave: nothing is requested after the failure
    expect(exchanges.length).toBeLessThanOrEqual(1 + SINGLE_RANGE_CONCURRENCY)
  })

  test("a read-ahead request answered with the whole file (200) fails the download instead of being written", async ({ tmpDir }) => {
    const files = layout(new Array(6).fill(BLOCK))
    override = (n, res) => {
      if (n !== 2) {
        return false
      }
      res.writeHead(200, { "Content-Length": files.newContent.length })
      res.end(files.newContent)
      return true
    }
    await expect(download(await tmpDir.createTempDir({ prefix: "read-ahead" }), files, await startHost(files.newContent))).rejects.toThrow(/did not return the requested range/)
  })

  test("after a redirect of the first request, the ranges ahead go straight to the redirect target", async ({ tmpDir }) => {
    const files = layout(new Array(8).fill(BLOCK))
    const origin = "https://updates.example.com/new.bin"
    const target = "https://downloads.example.com/new.bin"
    // Electron's net reports the redirect as an event (requestRange follows it; a Node response with a Location is not followed)
    const executor = new FakeElectronHttpExecutor((url, headers) => {
      if (url === origin) {
        return { location: target }
      }
      const [start, end] = String(headers.range).slice("bytes=".length).split("-").map(Number)
      return { statusCode: 206, headers: { "content-range": `bytes ${start}-${end}/${files.newContent.length}` }, body: files.newContent.subarray(start, end + 1) }
    })
    const newFile = await download(await tmpDir.createTempDir({ prefix: "read-ahead" }), files, new URL(origin), undefined, executor)
    expect(readFileSync(newFile).equals(files.newContent)).toBe(true)
    expect(executor.sent.filter(it => it.url === origin)).toHaveLength(1)
    expect(executor.sent.filter(it => it.url === target)).toHaveLength(8)
  })

  test("progress counts every range read ahead and ends at 100 %", async ({ tmpDir }) => {
    const files = layout(new Array(10).fill(BLOCK))
    const events: Array<ProgressInfo> = []
    await download(await tmpDir.createTempDir({ prefix: "read-ahead" }), files, await startHost(files.newContent), it => events.push(it))
    expect(events.length).toBeGreaterThan(0)
    const last = events[events.length - 1]
    expect(last.percent).toBe(100)
    expect(last.total).toBe(10 * BLOCK)
    expect(last.transferred).toBe(10 * BLOCK)
    const transferred = events.map(it => it.transferred)
    expect(transferred).toEqual([...transferred].sort((a, b) => a - b))
  })
})
