import { serializeToYaml } from "builder-util"
import { CancellationToken, CURRENT_APP_INSTALLER_FILE_NAME, DownloadOptions, HttpExecutor } from "builder-util-runtime"
import { AppImageUpdater, BaseUpdater, NsisUpdater } from "electron-updater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { createHash } from "crypto"
import fs from "fs"
import fsExtra from "fs-extra"
import { ClientRequest, createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from "http"
import { AddressInfo } from "net"
import * as path from "path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { gzipSync } from "zlib"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"

// Every way the differential download can fail must end in a full download whose sha512 is verified — never in a failed
// update, a hang, or an unverified file. Two things are not failures and must not fall back: a cancel ends the download
// with update-cancelled, and a download-progress listener that throws is only logged. These tests drive a real NsisUpdater
// (production fallback path, i.e. without `_testOnlyOptions`, which turns the fallback into a rethrow) against a local
// server that injects one failure at a time.

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

describe("differential download failures fall back to a verified full download, a cancel or a throwing listener does not", { concurrent: false }, () => {
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
    // an AppImageUpdater instead of an NsisUpdater
    appImage?: boolean
  }

  async function createUpdater(tmpDir: any, feedUrl: string, setup: Setup = {}) {
    const root = await tmpDir.getTempDir({ prefix: "diff-fallback" })
    const appAdapter = new TestAppAdapter(OLD_VERSION, root)
    const updater: BaseUpdater = setup.appImage === true ? new AppImageUpdater(null, appAdapter) : new NsisUpdater(null, appAdapter)
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
    // the test installers are unsigned bytes: opt out of the Authenticode check (#10380 fails closed without a publisherName),
    // these tests are about the differential download, not the signature
    await fsExtra.outputFile(
      updateConfigPath,
      serializeToYaml({
        provider: "generic",
        url: feedUrl,
        useMultipleRangeRequest: setup.multiRange !== false,
        updaterCacheDirName: "cache",
        verifyUpdateCodeSignature: false,
      })
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
      // correct bytes, but the answer does not say they are the requested range: never trusted (a multi-range request
      // answered this way is retried range by range first)
      test("206 without Content-Range", ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onRange((res, ranges) => {
            const [start, end] = ranges[0]
            res.writeHead(206, { "Content-Length": end - start + 1 })
            res.end(NEW.subarray(start, end + 1))
          }),
          { multiRange }
        ))
      test("206 with a wrong Content-Range", ({ tmpDir }) =>
        expectFallback(
          tmpDir,
          onRange((res, ranges) => {
            const [start, end] = ranges[0]
            res.writeHead(206, { "Content-Range": `bytes ${start + 1}-${end + 1}/${NEW.length}`, "Content-Length": end - start + 1 })
            res.end(NEW.subarray(start, end + 1))
          }),
          { multiRange }
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

  // e. cache problems
  describe("e. cache", () => {
    test("cached old installer missing", ({ tmpDir }) => expectFallback(tmpDir, () => false, { cacheOldInstaller: null }, false))
    test("cached old installer out of sync with the old blockmap", ({ tmpDir }) =>
      expectFallback(tmpDir, () => false, { cacheOldInstaller: Buffer.concat([blocks.Y, blocks.Y, blocks.Y, blocks.Y]) }))
    test("cached old installer shorter than the blockmap says", async ({ tmpDir }) => {
      // caught before any range request: the downloaded old blockmap does not end at the cached installer's size
      const url = await startServer()
      const { updater, logs } = await createUpdater(tmpDir, url, { cacheOldInstaller: blocks.A })
      await updater.checkForUpdates()
      const { updateFile } = await updater.downloadUpdate()
      expect((await fsExtra.readFile(updateFile)).equals(NEW)).toBe(true)
      expect(fullDownloads()).toHaveLength(1)
      expect(rangeRequests()).toEqual([])
      expect(logs.some(it => it.startsWith("info: The blockmap downloaded from") && it.endsWith("downloading the full update"))).toBe(true)
      expect(logs.filter(it => it.startsWith("error:"))).toEqual([])
    })
  })

  // f. synchronous throws in callbacks: an app's download-progress listener that throws runs inside a stream callback or a
  // response handler; it must neither escape as an uncaught exception nor break the download
  describe("f. synchronous throws", () => {
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

    test("a throwing download-progress listener does not keep progress from the listeners after it", async ({ tmpDir }) => {
      const url = await startServer()
      const { updater, logs } = await createUpdater(tmpDir, url, {
        multiRange: false,
        onProgress: () => {
          throw new Error("listener bug")
        },
      })
      let calls = 0
      updater.on("download-progress", () => calls++)
      let onceCalls = 0
      updater.once("download-progress", () => onceCalls++)
      await updater.checkForUpdates()
      const { updateFile } = await updater.downloadUpdate()
      expect((await fsExtra.readFile(updateFile)).equals(NEW)).toBe(true)
      expect(calls).toBeGreaterThan(0)
      // a `once` listener still runs once and removes itself
      expect(onceCalls).toBe(1)
      expect(updater.listenerCount("download-progress")).toBe(2)
      expect(logs.filter(it => it.includes('"download-progress" listener threw'))).toHaveLength(1)
    })
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

    test("cancel while a single-range retry request is stalled does not start a full download and settles", async ({ tmpDir }) => {
      let onStalled: () => void = () => {}
      const stalled = new Promise<void>(resolve => (onStalled = resolve))
      const url = await startServer((req, res, ranges) => {
        if (req.url !== INSTALLER || ranges == null) {
          return false
        }
        if (ranges.length > 1) {
          // a host that serves one range per request (GitHub release assets): the downloader retries range by range
          res.writeHead(501)
          res.end("Multiple ranges are not supported")
          return true
        }
        const [start, end] = ranges[0]
        res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${NEW.length}`, "Content-Length": end - start + 1 })
        // headers only, then nothing: a stalled connection
        res.flushHeaders()
        res.on("close", onRetryClosed)
        setTimeout(onStalled, 100)
        return true
      })
      let onRetryClosed: () => void = () => {}
      const retryClosed = new Promise<string>(resolve => (onRetryClosed = () => resolve("closed")))
      const { updater, logs } = await createUpdater(tmpDir, url, { multiRange: true, onProgress: () => {} })
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
      // the stall is on the retry, not on the multi-range request
      expect(logs.some(it => it.includes("retrying with one range per request"))).toBe(true)
      expect(rangeRequests().map(it => it.range?.includes(",") === true)).toEqual([true, false])
      expect(logs.filter(it => it.includes("fallback to full download"))).toEqual([])
      expect(outcome).toMatch(/^rejected: CancellationError/)
      expect(fullDownloads()).toHaveLength(0)
      expect(cancelledEvents).toBe(1)
      // the stalled retry request is aborted, not left open
      expect(await Promise.race([retryClosed, new Promise<string>(resolve => setTimeout(() => resolve("still open"), 2000))])).toBe("closed")
      // the differential download unsubscribes from the token once settled
      expect(token.listenerCount("cancel")).toBe(0)
    }, 15000)

    // The NSIS web package and the AppImage carry their blockmap at the end of the file, and their differential download first
    // reads it with a range request: a cancel while that request is stalled must not fall back to a full download either.
    for (const target of ["NSIS web package", "AppImage"] as const) {
      test(`cancel while the embedded blockmap request is stalled is a cancellation, not a fallback (${target})`, async ({ tmpDir }) => {
        const file = target === "AppImage" ? `/TestApp-${NEW_VERSION}.AppImage` : `/TestApp-${NEW_VERSION}.nsis.7z`
        let onStalled: () => void = () => {}
        const stalled = new Promise<void>(resolve => (onStalled = resolve))
        let onRequestClosed: () => void = () => {}
        const requestClosed = new Promise<string>(resolve => (onRequestClosed = () => resolve("closed")))
        const url = await startServer((req, res, ranges) => {
          if (req.url !== file || ranges == null) {
            return false
          }
          const [start, end] = ranges[0]
          res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${NEW.length}`, "Content-Length": end - start + 1 })
          // headers only, then nothing: a stalled connection
          res.flushHeaders()
          res.on("close", onRequestClosed)
          setTimeout(onStalled, 100)
          return true
        })
        const { updater, logs, cacheDir } = await createUpdater(tmpDir, url, { appImage: target === "AppImage" })
        const token = new CancellationToken()
        const fileUrl = new URL(file, url)
        const info = { url: fileUrl.href, sha512: sha512(NEW), size: NEW.length, blockMapSize: 100 }
        // feedBaseUrl null: no credential headers to strip, only the cancellation matters here
        const provider = { feedBaseUrl: null, isUseMultipleRangeRequest: false }
        const options = { updateInfoAndProvider: { info: { version: NEW_VERSION }, provider }, requestHeaders: {}, cancellationToken: token }
        const newFile = path.join(cacheDir, "new")
        const download: Promise<boolean> =
          target === "AppImage"
            ? (updater as any).downloadDifferential({ url: fileUrl, info }, path.join(cacheDir, "old.AppImage"), newFile, provider, options)
            : (updater as any).differentialDownloadWebPackage(
                options,
                { path: fileUrl.href, sha512: info.sha512, size: info.size, blockMapSize: info.blockMapSize },
                newFile,
                provider
              )
        await stalled
        token.cancel()
        const outcome = await Promise.race([
          download.then(
            isFallback => `resolved (fallback: ${isFallback})`,
            (e: any) => `rejected: ${e?.constructor?.name} ${e?.message}`
          ),
          new Promise<string>(resolve => setTimeout(() => resolve("still pending 5s after cancel (hang)"), 5000)),
        ])
        expect(logs.filter(it => it.includes("fallback to full download"))).toEqual([])
        expect(outcome).toMatch(/^rejected: CancellationError/)
        // the stalled request is aborted, not left open
        expect(await Promise.race([requestClosed, new Promise<string>(resolve => setTimeout(() => resolve("still open"), 2000))])).toBe("closed")
        expect(token.listenerCount("cancel")).toBe(0)
      }, 15000)
    }

    for (const multiRange of [true, false]) {
      test(`cancel during a copy from the old file settles only once the copy stopped reading it (${multiRange ? "multi" : "single"}-range)`, async ({ tmpDir }) => {
        const url = await startServer()
        const { updater, logs, cacheDir } = await createUpdater(tmpDir, url, { multiRange })
        await updater.checkForUpdates()
        const oldFileInode = (await fsExtra.stat(path.join(cacheDir, CURRENT_APP_INSTALLER_FILE_NAME))).ino

        // Holds the first read of the old installer (the copy of block A, the first operation on both paths) so the cancel
        // lands while that read is in flight. The descriptor must stay open until the read is over: closing it earlier lets
        // the read fail with EBADF or, worse, hit whatever file reuses the descriptor number.
        let releaseHeldRead: (() => void) | null = null
        let onReadHeld: () => void = () => {}
        const readHeld = new Promise<void>(resolve => (onReadHeld = resolve))
        const readErrors: Array<unknown> = []
        const realRead = fs.read
        const readSpy = vi.spyOn(fs, "read").mockImplementation(((...args: Array<any>) => {
          let isOldFile = false
          try {
            isOldFile = fs.fstatSync(args[0]).ino === oldFileInode
          } catch (_ignored) {
            // not a valid descriptor: let the real read report it
          }
          if (!isOldFile) {
            return (realRead as any)(...args)
          }
          const callback = args[args.length - 1]
          args[args.length - 1] = (error: unknown, ...rest: Array<any>) => {
            if (error != null) {
              readErrors.push(error)
            }
            callback(error, ...rest)
          }
          if (releaseHeldRead != null || readErrors.length > 0) {
            return (realRead as any)(...args)
          }
          releaseHeldRead = () => (realRead as any)(...args)
          onReadHeld()
        }) as any)

        try {
          const token = new CancellationToken()
          let isSettled = false
          const download = updater.downloadUpdate(token).then(
            () => "resolved",
            (e: any) => `rejected: ${e?.constructor?.name} ${e?.message}`
          )
          void download.then(() => (isSettled = true))
          await readHeld
          token.cancel()
          await new Promise(resolve => setTimeout(resolve, 300))
          const isSettledWhileReading = isSettled
          const release: () => void = releaseHeldRead ?? (() => {})
          release()
          const outcome = await Promise.race([download, new Promise<string>(resolve => setTimeout(() => resolve("still pending 5s after cancel (hang)"), 5000))])

          expect(outcome).toMatch(/^rejected: CancellationError/)
          // the download must not settle (and close the old file) while the copy still reads it
          expect(isSettledWhileReading).toBe(false)
          expect(readErrors).toEqual([])
          expect(logs.filter(it => it.includes("fallback to full download") || it.includes("cannot close"))).toEqual([])
          expect(fullDownloads()).toHaveLength(0)
        } finally {
          readSpy.mockRestore()
        }
      }, 15000)
    }

    test("cancel during a write to the new file settles only once the new file is closed", async ({ tmpDir }) => {
      const url = await startServer()
      const { updater, logs, cacheDir } = await createUpdater(tmpDir, url)
      await updater.checkForUpdates()
      const newFile = path.join(cacheDir, "pending", `temp-${INSTALLER.slice(1)}`)

      // Holds the first write to the new file so the cancel lands while that write is in flight. The stream that owns the
      // descriptor of the new file closes it only once the write is over, and the download must not settle before: a caller
      // that reacts to the rejection (a retry, a full download, removing the file) would race the stream still using it.
      let newFileFd: number | null = null
      let releaseHeldWrite: (() => void) | null = null
      let onWriteHeld: () => void = () => {}
      const writeHeld = new Promise<void>(resolve => (onWriteHeld = resolve))
      const ioErrors: Array<unknown> = []
      const events: Array<string> = []
      const isNewFile = (fd: number): boolean => {
        try {
          return fs.fstatSync(fd).ino === fs.statSync(newFile).ino
        } catch (_ignored) {
          return false
        }
      }
      const recordError =
        (callback: unknown) =>
        (error: unknown, ...rest: Array<any>) => {
          if (error != null) {
            ioErrors.push(error)
          }
          if (typeof callback === "function") {
            callback(error, ...rest)
          }
        }
      // the stream writes with fs.write or, for buffered chunks, fs.writev
      const holdFirstWrite =
        (realWrite: (...args: Array<any>) => void) =>
        (...args: Array<any>): void => {
          if (newFileFd == null && isNewFile(args[0])) {
            newFileFd = args[0]
          }
          if (newFileFd == null || args[0] !== newFileFd || events.length > 0) {
            realWrite(...args)
            return
          }
          args[args.length - 1] = recordError(args[args.length - 1])
          if (releaseHeldWrite != null) {
            realWrite(...args)
            return
          }
          releaseHeldWrite = () => realWrite(...args)
          onWriteHeld()
        }
      const realWrite = fs.write
      const realWritev = fs.writev
      const realClose = fs.close
      const writeSpy = vi.spyOn(fs, "write").mockImplementation(holdFirstWrite(realWrite) as any)
      const writevSpy = vi.spyOn(fs, "writev").mockImplementation(holdFirstWrite(realWritev) as any)
      const closeSpy = vi.spyOn(fs, "close").mockImplementation((fd: number, callback?: unknown) => {
        // once settled, the descriptor number can be reused by another file
        if (fd !== newFileFd || events.includes("settled")) {
          realClose(fd, callback as any)
          return
        }
        realClose(fd, (error: unknown) => {
          events.push("new file closed")
          recordError(callback)(error)
        })
      })

      try {
        const token = new CancellationToken()
        const download = updater.downloadUpdate(token).then(
          () => "resolved",
          (e: any) => `rejected: ${e?.constructor?.name} ${e?.message}`
        )
        void download.then(() => events.push("settled"))
        await writeHeld
        token.cancel()
        await new Promise(resolve => setTimeout(resolve, 300))
        const isSettledWhileWriting = events.includes("settled")
        const release: () => void = releaseHeldWrite ?? (() => {})
        release()
        const outcome = await Promise.race([download, new Promise<string>(resolve => setTimeout(() => resolve("still pending 5s after cancel (hang)"), 5000))])

        expect(outcome).toMatch(/^rejected: CancellationError/)
        // the download must not settle while the new file is still written
        expect(isSettledWhileWriting).toBe(false)
        // the new file is closed once, by its stream, before the download settles
        expect(events).toEqual(["new file closed", "settled"])
        expect(ioErrors).toEqual([])
        expect(logs.filter(it => it.includes("fallback to full download") || it.includes("cannot close"))).toEqual([])
        expect(fullDownloads()).toHaveLength(0)
      } finally {
        writeSpy.mockRestore()
        writevSpy.mockRestore()
        closeSpy.mockRestore()
      }
    }, 15000)
  })
})
