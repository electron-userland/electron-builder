import { serializeToYaml } from "builder-util"
import { CancellationToken, CURRENT_APP_INSTALLER_FILE_NAME, DownloadOptions, HttpExecutor } from "builder-util-runtime"
import { NsisUpdater } from "electron-updater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import { ClientRequest, createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from "http"
import { AddressInfo } from "net"
import * as path from "path"
import { afterEach, describe, expect, test } from "vitest"
import { gzipSync } from "zlib"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"

// Every way the differential download can fail must end in a full download whose sha512 is verified — never in a failed
// update, a hang, or an unverified file. These tests drive a real NsisUpdater (production fallback path, i.e. without
// `_testOnlyOptions`, which turns the fallback into a rethrow) against a local server that injects one failure at a time.

// Plain node:http (no proxy agent), with a `download` like ElectronHttpExecutor's: the real configurePipes, so the full
// download is checked against the sha512 from the update manifest.
class LocalHttpExecutor extends HttpExecutor<ClientRequest> {
  socketTimeout: number | null = null

  createRequest(options: any, callback: (response: any) => void): ClientRequest {
    return httpRequest(options, callback)
  }

  addErrorAndTimeoutHandlers(request: any, reject: (error: Error) => void, timeout?: number) {
    super.addErrorAndTimeoutHandlers(request, reject, this.socketTimeout ?? timeout)
  }

  download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    return options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const requestOptions: any = { headers: options.headers || undefined }
      requestOptions.protocol = url.protocol
      requestOptions.hostname = url.hostname
      requestOptions.port = url.port
      requestOptions.path = url.pathname + url.search
      this.doDownload(requestOptions, { destination, options, onCancel, callback: error => (error == null ? resolve(destination) : reject(error)), responseHandler: null }, 0)
    })
  }
}

const BLOCK = 4096
function block(seed: number): Buffer {
  const buffer = Buffer.alloc(BLOCK)
  let x = seed
  for (let i = 0; i < BLOCK; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    buffer[i] = x >> 16
  }
  return buffer
}

// old = A X C Y, new = A B C D: A and C are copied, B and D downloaded (two ranges, so the generic provider sends a multi-range request)
const blocks = { A: block(1), B: block(2), C: block(3), D: block(4), X: block(5), Y: block(6) }
const OLD = Buffer.concat([blocks.A, blocks.X, blocks.C, blocks.Y])
const NEW = Buffer.concat([blocks.A, blocks.B, blocks.C, blocks.D])
const blockMapJson = (names: Array<string>) => JSON.stringify({ version: "2", files: [{ name: "file", offset: 0, checksums: names, sizes: names.map(() => BLOCK) }] })
const OLD_BLOCKMAP = gzipSync(blockMapJson(["A", "X", "C", "Y"]))
const NEW_BLOCKMAP = gzipSync(blockMapJson(["A", "B", "C", "D"]))
const sha512 = (data: Buffer) => createHash("sha512").update(data).digest("base64")

const OLD_VERSION = "1.0.0"
const NEW_VERSION = "1.1.0"
const INSTALLER = `/TestApp-Setup-${NEW_VERSION}.exe`
const NEW_BLOCKMAP_PATH = `${INSTALLER}.blockmap`
const OLD_BLOCKMAP_PATH = `/TestApp-Setup-${OLD_VERSION}.exe.blockmap`
const UPDATE_INFO_PATHS = new Set(["/latest.yml", "/latest-mac.yml", "/latest-linux.yml"])

type Req = { path: string; range: string | null }
// returns true when it handled the request
type Override = (req: IncomingMessage, res: ServerResponse, ranges: Array<[number, number]> | null) => boolean

function parseRanges(header: string | undefined): Array<[number, number]> | null {
  if (header == null) {
    return null
  }
  return header
    .slice("bytes=".length)
    .split(",")
    .map(range => range.trim().split("-").map(Number) as [number, number])
}

function multipart(ranges: Array<[number, number]>, boundary = "test-boundary", bodyBoundary = boundary, data = NEW): Buffer {
  const parts = ranges.map(([start, end]) =>
    Buffer.concat([
      Buffer.from(`\r\n--${bodyBoundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${data.length}\r\n\r\n`),
      data.subarray(start, end + 1),
    ])
  )
  return Buffer.concat([...parts, Buffer.from(`\r\n--${bodyBoundary}--\r\n`)])
}

describe("every differential download failure falls back to a verified full download", { concurrent: false }, () => {
  let server: Server | null = null
  let requests: Array<Req> = []

  afterEach(async () => {
    if (server != null) {
      server.closeAllConnections()
      await new Promise<void>(resolve => server!.close(() => resolve()))
      server = null
    }
  })

  async function startServer(override: Override = () => false, fullBody: Buffer = NEW): Promise<string> {
    requests = []
    server = createServer((req, res) => {
      const pathname = new URL(req.url!, "http://localhost").pathname
      requests.push({ path: pathname, range: req.headers.range ?? null })
      const ranges = parseRanges(req.headers.range)
      if (override(req, res, ranges) === true) {
        return
      }
      // the provider asks for the channel file of the host platform (latest.yml, latest-mac.yml or latest-linux.yml)
      if (UPDATE_INFO_PATHS.has(pathname)) {
        res.end(serializeToYaml({ version: NEW_VERSION, files: [{ url: INSTALLER.slice(1), sha512: sha512(NEW), size: NEW.length }], releaseDate: "2024-01-01T00:00:00.000Z" }))
      } else if (pathname === NEW_BLOCKMAP_PATH) {
        res.end(NEW_BLOCKMAP)
      } else if (pathname === OLD_BLOCKMAP_PATH) {
        res.end(OLD_BLOCKMAP)
      } else if (pathname === INSTALLER) {
        if (ranges == null) {
          res.writeHead(200, { "Content-Length": fullBody.length })
          res.end(fullBody)
        } else if (ranges.length > 1) {
          res.writeHead(206, { "Content-Type": "multipart/byteranges; boundary=test-boundary" })
          res.end(multipart(ranges))
        } else {
          const [start, end] = ranges[0]
          res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${NEW.length}`, "Content-Length": end - start + 1 })
          res.end(NEW.subarray(start, end + 1))
        }
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  interface Setup {
    multiRange?: boolean
    cacheOldInstaller?: Buffer | null
    cacheOldBlockMap?: Buffer | null
    socketTimeout?: number
    onProgress?: () => void
  }

  async function createUpdater(tmpDir: any, feedUrl: string, setup: Setup = {}) {
    const root = await tmpDir.getTempDir({ prefix: "diff-fallback" })
    const updater = new NsisUpdater(null, new TestAppAdapter(OLD_VERSION, root))
    const executor = new LocalHttpExecutor()
    executor.socketTimeout = setup.socketTimeout ?? null
    ;(updater as any).httpExecutor = executor
    const logs: Array<string> = []
    updater.logger = {
      info: (m: any) => logs.push(`info: ${m}`),
      warn: (m: any) => logs.push(`warn: ${m}`),
      error: (m: any) => logs.push(`error: ${m}`),
    }
    updater.forceDevUpdateConfig = true
    updater.autoDownload = false
    const updateConfigPath = path.join(root, "app-update.yml")
    await fsExtra.outputFile(
      updateConfigPath,
      serializeToYaml({ provider: "generic", url: feedUrl, useMultipleRangeRequest: setup.multiRange !== false, updaterCacheDirName: "cache" })
    )
    updater.updateConfigPath = updateConfigPath
    const cacheDir = path.join(root, "cache")
    await fsExtra.mkdirs(cacheDir)
    if (setup.cacheOldInstaller !== null) {
      await fsExtra.outputFile(path.join(cacheDir, CURRENT_APP_INSTALLER_FILE_NAME), setup.cacheOldInstaller ?? OLD)
    }
    if (setup.cacheOldBlockMap != null) {
      await fsExtra.outputFile(path.join(cacheDir, "current.blockmap"), setup.cacheOldBlockMap)
    }
    ;(updater as any).downloadedUpdateHelper = new DownloadedUpdateHelper(cacheDir)
    if (setup.onProgress != null) {
      updater.on("download-progress", setup.onProgress)
    }
    return { updater, logs, cacheDir }
  }

  const fullDownloads = () => requests.filter(it => it.path === INSTALLER && it.range == null)
  const rangeRequests = () => requests.filter(it => it.path === INSTALLER && it.range != null)

  async function expectFallback(tmpDir: any, override: Override, setup: Setup = {}, expectRangeRequests = true) {
    const url = await startServer(override)
    const { updater, logs } = await createUpdater(tmpDir, url, setup)
    await updater.checkForUpdates()
    const { updateFile } = await updater.downloadUpdate()
    expect((await fsExtra.readFile(updateFile)).equals(NEW)).toBe(true)
    expect(fullDownloads()).toHaveLength(1)
    if (expectRangeRequests) {
      expect(rangeRequests().length).toBeGreaterThan(0)
    }
    expect(logs.some(it => it.startsWith("error: Cannot download differentially, fallback to full download"))).toBe(true)
    // the pending dir only holds the final installer (+ blockmap), no leftover temp file
    const pending = await fsExtra.readdir(path.dirname(updateFile))
    expect(pending.filter(it => it.startsWith("temp-"))).toEqual([])
    return { logs }
  }

  test("control: a working host updates differentially (no full download)", async ({ tmpDir }) => {
    for (const multiRange of [true, false]) {
      const url = await startServer()
      const { updater, logs } = await createUpdater(tmpDir, url, { multiRange })
      await updater.checkForUpdates()
      const token = new CancellationToken()
      const { updateFile } = await updater.downloadUpdate(token)
      expect((await fsExtra.readFile(updateFile)).equals(NEW)).toBe(true)
      expect(fullDownloads()).toHaveLength(0)
      expect(logs.filter(it => it.startsWith("error:"))).toEqual([])
      // the differential download unsubscribes from the token once settled
      expect(token.listenerCount("cancel")).toBe(0)
      server!.closeAllConnections()
      await new Promise<void>(resolve => server!.close(() => resolve()))
      server = null
    }
  })

  test("control: a full download that does not match the sha512 fails the update (never installs a bad file)", async ({ tmpDir }) => {
    const bad = Buffer.from(NEW)
    bad[10] ^= 0xff
    const url = await startServer(() => false, bad)
    const { updater } = await createUpdater(tmpDir, url, { cacheOldInstaller: null })
    await updater.checkForUpdates()
    await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_CHECKSUM_MISMATCH" })
  })

  // a. blockmap fetch failures
  describe("a. blockmap fetch", () => {
    test("new blockmap 404", ({ tmpDir }) =>
      expectFallback(
        tmpDir,
        (req, res) => {
          if (req.url === NEW_BLOCKMAP_PATH) {
            res.writeHead(404)
            res.end()
            return true
          }
          return false
        },
        {},
        false
      ))
    test("new blockmap 500", ({ tmpDir }) =>
      expectFallback(
        tmpDir,
        (req, res) => {
          if (req.url === NEW_BLOCKMAP_PATH) {
            res.writeHead(500)
            res.end("boom")
            return true
          }
          return false
        },
        {},
        false
      ))
    test("new blockmap connection reset", ({ tmpDir }) =>
      expectFallback(
        tmpDir,
        (req, res) => {
          if (req.url === NEW_BLOCKMAP_PATH) {
            res.socket?.destroy()
            return true
          }
          return false
        },
        {},
        false
      ))
    test("old blockmap 404 (not cached)", ({ tmpDir }) =>
      expectFallback(
        tmpDir,
        (req, res) => {
          if (req.url === OLD_BLOCKMAP_PATH) {
            res.writeHead(404)
            res.end()
            return true
          }
          return false
        },
        {},
        false
      ))
    test("old blockmap connection reset (not cached)", ({ tmpDir }) =>
      expectFallback(
        tmpDir,
        (req, res) => {
          if (req.url === OLD_BLOCKMAP_PATH) {
            res.socket?.destroy()
            return true
          }
          return false
        },
        {},
        false
      ))
  })

  // b. blockmap parse failures
  describe("b. blockmap parse", () => {
    const serveNewBlockMap =
      (body: Buffer): Override =>
      (req, res) => {
        if (req.url === NEW_BLOCKMAP_PATH) {
          res.end(body)
          return true
        }
        return false
      }
    test("not gzip", ({ tmpDir }) => expectFallback(tmpDir, serveNewBlockMap(Buffer.from("not gzip at all")), {}, false))
    test("gzip of invalid JSON", ({ tmpDir }) => expectFallback(tmpDir, serveNewBlockMap(gzipSync("{nope")), {}, false))
    test("wrong shape ({})", ({ tmpDir }) => expectFallback(tmpDir, serveNewBlockMap(gzipSync("{}")), {}, false))
    test("wrong shape (null)", ({ tmpDir }) => expectFallback(tmpDir, serveNewBlockMap(gzipSync("null")), {}, false))
    test("different blockmap version", ({ tmpDir }) =>
      expectFallback(tmpDir, serveNewBlockMap(gzipSync(JSON.stringify({ ...JSON.parse(blockMapJson(["A", "B", "C", "D"])), version: "1" }))), {}, false))
    test("blockmap sizes that do not add up to the file size", ({ tmpDir }) =>
      expectFallback(
        tmpDir,
        serveNewBlockMap(gzipSync(JSON.stringify({ version: "2", files: [{ name: "file", offset: 0, checksums: ["A", "B"], sizes: [BLOCK, BLOCK] }] }))),
        {},
        false
      ))
    test("corrupt cached old blockmap is ignored (re-fetched)", async ({ tmpDir }) => {
      const url = await startServer()
      const { updater } = await createUpdater(tmpDir, url, { cacheOldBlockMap: Buffer.from("garbage") })
      await updater.checkForUpdates()
      const { updateFile } = await updater.downloadUpdate()
      expect((await fsExtra.readFile(updateFile)).equals(NEW)).toBe(true)
      expect(requests.some(it => it.path === OLD_BLOCKMAP_PATH)).toBe(true)
    })
  })

  // c. range responses
  for (const multiRange of [true, false]) {
    describe(`c. range responses (${multiRange ? "multi-range" : "single-range"} provider)`, () => {
      const onRange =
        (fn: (res: ServerResponse, ranges: Array<[number, number]>) => void): Override =>
        (req, res, ranges) => {
          if (req.url === INSTALLER && ranges != null) {
            fn(res, ranges)
            return true
          }
          return false
        }
      test("200 with the whole file", ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onRange(res => {
            res.writeHead(200, { "Accept-Ranges": "bytes", "Content-Length": NEW.length })
            res.end(NEW)
          }),
          { multiRange }
        ))
      test("416", ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onRange(res => {
            res.writeHead(416)
            res.end()
          }),
          { multiRange }
        ))
      test("500", ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onRange(res => {
            res.writeHead(500)
            res.end()
          }),
          { multiRange }
        ))
      test("connection reset mid-body", ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onRange((res, ranges) => {
            const [start, end] = ranges[0]
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${NEW.length}`,
              "Content-Length": end - start + 1,
              "Content-Type": "multipart/byteranges; boundary=test-boundary",
            })
            res.write(NEW.subarray(start, start + 100))
            setTimeout(() => res.socket?.destroy(), 20)
          }),
          { multiRange }
        ))
      test("correct framing but wrong bytes (sha512 mismatch after assembly)", ({ tmpDir }) => {
        const evil = Buffer.from(NEW)
        evil[BLOCK + 5] ^= 0xff
        return expectFallback(
          tmpDir,
          onRange((res, ranges) => {
            if (ranges.length > 1) {
              res.writeHead(206, { "Content-Type": "multipart/byteranges; boundary=test-boundary" })
              res.end(multipart(ranges, "test-boundary", "test-boundary", evil))
              return
            }
            const [start, end] = ranges[0]
            res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${NEW.length}`, "Content-Length": end - start + 1 })
            res.end(evil.subarray(start, end + 1))
          }),
          { multiRange }
        )
      })
      test("stalled response hits the socket timeout", ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onRange((res, ranges) => {
            const [start, end] = ranges[0]
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${NEW.length}`,
              "Content-Length": end - start + 1,
              "Content-Type": "multipart/byteranges; boundary=test-boundary",
            })
            res.write(NEW.subarray(start, start + 10))
            // never finishes
          }),
          { multiRange, socketTimeout: 300 }
        ))
    })
  }

  // d. multipart mismatches
  describe("d. multipart/byteranges mismatches", () => {
    const onMulti =
      (fn: (res: ServerResponse, ranges: Array<[number, number]>) => void): Override =>
      (req, res, ranges) => {
        if (req.url === INSTALLER && ranges != null && ranges.length > 1) {
          fn(res, ranges)
          return true
        }
        return false
      }
    // DataSplitter locates parts by length and header terminators, not by the boundary text, so this one may legitimately
    // succeed differentially; either way the result must be the verified new file
    test("body uses a different boundary than the header", async ({ tmpDir }) => {
      const url = await startServer(
        onMulti((res, ranges) => {
          res.writeHead(206, { "Content-Type": "multipart/byteranges; boundary=test-boundary" })
          res.end(multipart(ranges, "test-boundary", "a-much-longer-other-boundary"))
        })
      )
      const { updater } = await createUpdater(tmpDir, url)
      await updater.checkForUpdates()
      const { updateFile } = await updater.downloadUpdate()
      expect((await fsExtra.readFile(updateFile)).equals(NEW)).toBe(true)
    })
    test(
      "one part missing",
      ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onMulti((res, ranges) => {
            res.writeHead(206, { "Content-Type": "multipart/byteranges; boundary=test-boundary" })
            res.end(multipart(ranges.slice(0, 1)))
          })
        ),
      20000
    )
    test(
      "parts of the wrong size",
      ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onMulti((res, ranges) => {
            res.writeHead(206, { "Content-Type": "multipart/byteranges; boundary=test-boundary" })
            res.end(multipart(ranges.map(([s, e]) => [s, e - 100] as [number, number])))
          })
        ),
      20000
    )
    test("truncated body (connection closed early)", ({ tmpDir }) =>
      expectFallback(
        tmpDir,
        onMulti((res, ranges) => {
          const body = multipart(ranges)
          res.writeHead(206, { "Content-Type": "multipart/byteranges; boundary=test-boundary", "Content-Length": body.length })
          res.write(body.subarray(0, body.length / 2))
          setTimeout(() => res.socket?.destroy(), 20)
        })
      ))
  })

  // f. cache problems
  describe("f. cache", () => {
    test("cached old installer missing", ({ tmpDir }) => expectFallback(tmpDir, () => false, { cacheOldInstaller: null }, false))
    test("cached old installer out of sync with the old blockmap", ({ tmpDir }) =>
      expectFallback(tmpDir, () => false, { cacheOldInstaller: Buffer.concat([blocks.Y, blocks.Y, blocks.Y, blocks.Y]) }))
    test("cached old installer shorter than the blockmap says", ({ tmpDir }) => expectFallback(tmpDir, () => false, { cacheOldInstaller: blocks.A }))
  })

  // h. synchronous throws in callbacks: an app's download-progress listener that throws runs inside a stream callback or a
  // response handler; it must neither escape as an uncaught exception nor break the download
  describe("h. synchronous throws", () => {
    // the multi-range splitter only reports progress once time has passed since the response started, so send the
    // multipart body in two halves
    const slowMultipart: Override = (req, res, ranges) => {
      if (req.url === INSTALLER && ranges != null && ranges.length > 1) {
        const body = multipart(ranges)
        res.writeHead(206, { "Content-Type": "multipart/byteranges; boundary=test-boundary" })
        res.write(body.subarray(0, body.length / 2))
        setTimeout(() => res.end(body.subarray(body.length / 2)), 50)
        return true
      }
      return false
    }
    for (const mode of ["multi-range", "single-range", "full"] as const) {
      test(`a throwing download-progress listener does not break the download (${mode})`, async ({ tmpDir }) => {
        const url = await startServer(mode === "multi-range" ? slowMultipart : () => false)
        let calls = 0
        const { updater, logs } = await createUpdater(tmpDir, url, {
          multiRange: mode === "multi-range",
          onProgress: () => {
            calls++
            throw new Error("listener bug")
          },
        })
        updater.disableDifferentialDownload = mode === "full"
        await updater.checkForUpdates()
        const outcome = await Promise.race([
          updater.downloadUpdate().then(
            async ({ updateFile: file }) => ((await fsExtra.readFile(file)).equals(NEW) ? "resolved with the new file" : "resolved with a WRONG file"),
            (e: any) => `rejected: ${e?.message}`
          ),
          new Promise<string>(resolve => setTimeout(() => resolve("still pending after 5s (hang)"), 5000)),
        ])
        expect(outcome).toBe("resolved with the new file")
        expect(calls).toBeGreaterThan(0)
        // the download went on despite the listener (a differential one does not fall back)
        expect(fullDownloads()).toHaveLength(mode === "full" ? 1 : 0)
        expect(logs.filter(it => it.includes("fallback to full download"))).toEqual([])
        expect(logs.filter(it => it.includes('"download-progress" listener threw'))).toHaveLength(1)
      }, 15000)
    }
  })

  // g. cancellation: must NOT fall back to a full download, and must not hang
  describe("g. cancellation", () => {
    for (const multiRange of [true, false]) {
      test(`cancel while a range request is stalled does not start a full download and settles (${multiRange ? "multi" : "single"}-range)`, async ({ tmpDir }) => {
        let onStalled: () => void = () => {}
        const stalled = new Promise<void>(resolve => (onStalled = resolve))
        const url = await startServer((req, res, ranges) => {
          if (req.url === INSTALLER && ranges != null) {
            const [start, end] = ranges[0]
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${NEW.length}`,
              "Content-Length": end - start + 1,
              "Content-Type": "multipart/byteranges; boundary=test-boundary",
            })
            // headers only, then nothing: a stalled connection
            res.flushHeaders()
            setTimeout(onStalled, 100)
            return true
          }
          return false
        })
        const { updater, logs } = await createUpdater(tmpDir, url, { multiRange, onProgress: () => {} })
        let cancelledEvents = 0
        updater.on("update-cancelled", () => cancelledEvents++)
        await updater.checkForUpdates()
        const token = new CancellationToken()
        const download = updater.downloadUpdate(token)
        await stalled
        token.cancel()
        const outcome = await Promise.race([
          download.then(
            () => "resolved",
            (e: any) => `rejected: ${e?.constructor?.name} ${e?.message}`
          ),
          new Promise<string>(resolve => setTimeout(() => resolve("still pending 5s after cancel (hang)"), 5000)),
        ])
        // a user cancellation is not a differential failure: it must not be logged as one
        expect(logs.filter(it => it.includes("fallback to full download"))).toEqual([])
        expect(outcome).toMatch(/^rejected: CancellationError/)
        expect(fullDownloads()).toHaveLength(0)
        expect(cancelledEvents).toBe(1)
      }, 15000)
    }
  })
})
