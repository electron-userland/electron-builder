import { NodeHttpExecutor } from "builder-util"
import { configureRequestOptions, configureRequestUrl, DownloadOptions, GenericServerOptions } from "builder-util-runtime"
import { NsisUpdater } from "electron-updater"
import type { Logger } from "electron-updater"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import * as http from "http"
import type { Socket } from "net"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { describe, test } from "vitest"
import { gzipSync } from "zlib"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"
import { writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// The full download goes through configurePipes, like ElectronHttpExecutor.download, so its sha512 is verified too.
class VerifyingNodeHttpExecutor extends NodeHttpExecutor {
  download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    return options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const requestOptions: http.RequestOptions = { headers: options.headers ?? undefined }
      configureRequestUrl(url, requestOptions)
      configureRequestOptions(requestOptions)
      this.doDownload(requestOptions, { destination, options, onCancel, callback: error => (error == null ? resolve(destination) : reject(error)), responseHandler: null }, 0)
    })
  }
}

const BLOCK = 1024
function bytes(seed: number, length: number): Buffer {
  const out = Buffer.alloc(length)
  let hash = createHash("sha256").update(`seed-${seed}`).digest()
  for (let i = 0; i < length; i += hash.length) {
    hash.copy(out, i)
    hash = createHash("sha256").update(hash).digest()
  }
  return out
}
function blockMapOf(data: Buffer) {
  const checksums: Array<string> = []
  const sizes: Array<number> = []
  for (let i = 0; i < data.length; i += BLOCK) {
    const block = data.subarray(i, i + BLOCK)
    checksums.push(createHash("sha256").update(block).digest("base64"))
    sizes.push(block.length)
  }
  return gzipSync(JSON.stringify({ version: "2", files: [{ name: "file", offset: 0, checksums, sizes }] }))
}

// 1.0.0 is installed (and cached as installer.exe); 2.0.0 changes 8 blocks and appends 4
const OLD = bytes(1, 64 * BLOCK)
const NEW = Buffer.concat([OLD.subarray(0, 20 * BLOCK), bytes(2, 8 * BLOCK), OLD.subarray(28 * BLOCK), bytes(3, 4 * BLOCK)])
const NEW_FILE = "TestApp-Setup-2.0.0.exe"

interface Case {
  readonly sha512Encoding?: "base64" | "hex"
  readonly multiRange?: boolean
  // without the cached old installer the differential download fails, so the update must be downloaded in full
  readonly cacheOldInstaller?: boolean
  readonly logger: Logger
}

interface Outcome {
  readonly downloaded: Buffer | null
  readonly error: unknown
  readonly fullGets: number
  readonly rangeGets: number
}

function serveRanges(request: http.IncomingMessage, response: http.ServerResponse): void {
  const range = request.headers.range
  if (range == null) {
    response.writeHead(200, { "Content-Length": NEW.length, "Accept-Ranges": "bytes" })
    response.end(NEW)
    return
  }
  const parts = range
    .replace(/^bytes=/, "")
    .split(",")
    .map(it => it.trim().split("-").map(Number))
  if (parts.length === 1) {
    const [start, end] = parts[0]
    response.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${NEW.length}`, "Content-Length": end - start + 1 })
    response.end(NEW.subarray(start, end + 1))
    return
  }
  const boundary = "BOUNDARY42"
  const chunks: Array<Buffer> = []
  for (const [start, end] of parts) {
    chunks.push(Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${NEW.length}\r\n\r\n`))
    chunks.push(NEW.subarray(start, end + 1))
  }
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const body = Buffer.concat(chunks)
  response.writeHead(206, { "Content-Type": `multipart/byteranges; boundary=${boundary}`, "Content-Length": body.length })
  response.end(body)
}

// Drives a real NsisUpdater against a local server, with the production fallback (no _testOnlyOptions during the download).
async function update(tmpDir: TmpDir, c: Case): Promise<Outcome> {
  const sha512 = createHash("sha512")
    .update(NEW)
    .digest(c.sha512Encoding ?? "base64")
  const yml = [
    "version: 2.0.0",
    "files:",
    `  - url: ${NEW_FILE}`,
    `    sha512: ${sha512}`,
    `    size: ${NEW.length}`,
    `path: ${NEW_FILE}`,
    `sha512: ${sha512}`,
    "releaseDate: '2024-01-01T00:00:00.000Z'",
    "",
  ].join("\n")
  let fullGets = 0
  let rangeGets = 0
  const sockets = new Set<Socket>()
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname
    if (pathname.endsWith(".yml")) {
      response.writeHead(200, { "Content-Type": "text/yaml" })
      response.end(yml)
    } else if (pathname === `/${NEW_FILE}`) {
      if (request.headers.range == null) {
        fullGets++
      } else {
        rangeGets++
      }
      serveRanges(request, response)
    } else if (pathname === `/${NEW_FILE}.blockmap`) {
      response.writeHead(200)
      response.end(blockMapOf(NEW))
    } else if (pathname === "/TestApp-Setup-1.0.0.exe.blockmap") {
      response.writeHead(200)
      response.end(blockMapOf(OLD))
    } else {
      response.writeHead(404)
      response.end()
    }
  })
  server.on("connection", socket => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()))
  try {
    const address = server.address()
    if (address == null || typeof address === "string") {
      throw new Error("server has no port")
    }
    const baseCachePath = await tmpDir.getTempDir({ prefix: "differential-fallback-hardening" })
    const updater = new NsisUpdater(null, new TestAppAdapter("1.0.0", baseCachePath))
    Object.assign(updater, { httpExecutor: new VerifyingNodeHttpExecutor(), _testOnlyOptions: { platform: "win32" } })
    updater.logger = c.logger
    updater.autoDownload = false
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: `http://127.0.0.1:${address.port}`,
      updaterCacheDirName: "differential-fallback-hardening",
      useMultipleRangeRequest: c.multiRange ?? true,
    })
    // the cache of the installed 1.0.0: installer.exe and its blockmap
    const cacheDir = path.join(baseCachePath, "differential-fallback-hardening")
    if (c.cacheOldInstaller !== false) {
      await fsExtra.outputFile(path.join(cacheDir, "installer.exe"), OLD)
    }
    await fsExtra.outputFile(path.join(cacheDir, "current.blockmap"), blockMapOf(OLD))

    const check = await updater.checkForUpdates()
    if (check?.isUpdateAvailable !== true) {
      throw new Error("no update offered")
    }
    // production fallback from here on: a failed differential download falls back to a full one instead of rethrowing
    Object.assign(updater, { _testOnlyOptions: null })
    try {
      const { updateFile } = await updater.downloadUpdate()
      return { downloaded: await fsExtra.readFile(updateFile), error: null, fullGets, rangeGets }
    } catch (error: unknown) {
      return { downloaded: null, error, fullGets, rangeGets }
    }
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} }
type Level = "info" | "warn" | "error" | "debug"
// a logger that throws (e.g. a broken transport) on the messages of one level that match `match`, and is silent otherwise
function throwingLogger(throwingLevel: Level, match: RegExp): Logger {
  const log = (level: Level) => (message?: unknown) => {
    if (level === throwingLevel && match.test(String(message))) {
      throw new Error(`logger ${level} threw`)
    }
  }
  return { info: log("info"), warn: log("warn"), error: log("error"), debug: log("debug") }
}

// a broken download hangs rather than fails, so a short timeout keeps a regression from stalling the suite
describe("differential download fallback hardening", { concurrent: false, timeout: 20_000 }, () => {
  for (const multiRange of [true, false]) {
    const mode = multiRange ? "multi-range" : "single-range"

    test(`a hex-encoded sha512 in the manifest is verified, so the update is downloaded differentially (${mode})`, async ({ expect, tmpDir }) => {
      const outcome = await update(tmpDir, { sha512Encoding: "hex", multiRange, logger: silentLogger })
      expect(outcome.error).toBeNull()
      expect(outcome.downloaded?.equals(NEW)).toBe(true)
      expect(outcome.fullGets).toBe(0)
      expect(outcome.rangeGets).toBeGreaterThan(0)
    })
  }

  // the single-range downloader logs each range from the previous range's (or copy's) callback, where a throw used to escape as
  // an uncaught exception and leave the download hanging
  test("a logger whose debug throws does not stop a differential download", async ({ expect, tmpDir }) => {
    const outcome = await update(tmpDir, { multiRange: false, logger: throwingLogger("debug", /download range/) })
    expect(outcome.error).toBeNull()
    expect(outcome.downloaded?.equals(NEW)).toBe(true)
    expect(outcome.fullGets).toBe(0)
  })

  test("a logger that throws while logging the failed differential download does not stop the full download", async ({ expect, tmpDir }) => {
    const outcome = await update(tmpDir, { cacheOldInstaller: false, logger: throwingLogger("error", /Cannot download differentially/) })
    expect(outcome.error).toBeNull()
    expect(outcome.downloaded?.equals(NEW)).toBe(true)
    expect(outcome.fullGets).toBe(1)
  })
})
