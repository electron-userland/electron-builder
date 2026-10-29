import { blake2b } from "@noble/hashes/blake2.js"
import { CancellationToken } from "builder-util-runtime"
import { BlockInput, blockMapSizeLimit, encodeBlockMapV3, MAX_BLOCK_MAP_SIZE } from "builder-util-runtime/internal"
import { AppImageUpdater } from "electron-updater"
import { AppUpdater, isBlockMapOfFile } from "electron-updater/src/AppUpdater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { createHash } from "crypto"
import { outputFile, pathExists } from "fs-extra"
import * as http from "http"
import { AddressInfo } from "net"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { gzipSync } from "zlib"
import { httpExecutor, makeLogger } from "../helpers/updaterTestUtil"

const stubApp: AppAdapter = {
  name: "TestApp",
  version: "1.0.0",
  isPackaged: false,
  appUpdateConfigPath: "/tmp/app-update.yml",
  userDataPath: "/tmp",
  baseCachePath: "/tmp",
  whenReady: () => Promise.resolve(),
  relaunch: () => {},
  quit: () => {},
  onQuit: () => {},
}

const OLD_INSTALLER_FILE_NAME = "installer.exe"
const sha512 = (data: Buffer, encoding: "base64" | "hex" = "base64") => createHash("sha512").update(data).digest(encoding)
const v2BlockMap = (sizes: Array<number>, tag: string) => ({ version: "2" as const, files: [{ name: "file", offset: 0, checksums: sizes.map((_, i) => `${tag}-${i}`), sizes }] })
const gzippedJson = (value: unknown) => gzipSync(JSON.stringify(value))

describe("blockMapSizeLimit", () => {
  test("is 1 MiB plus 64 bytes per KiB of the file, capped at MAX_BLOCK_MAP_SIZE", () => {
    expect(blockMapSizeLimit(0)).toBe(1024 * 1024)
    expect(blockMapSizeLimit(1)).toBe(1024 * 1024 + 64)
    expect(blockMapSizeLimit(100 * 1024 * 1024)).toBe(1024 * 1024 + 100 * 1024 * 64)
    expect(blockMapSizeLimit(10 * 1024 * 1024 * 1024)).toBe(MAX_BLOCK_MAP_SIZE)
  })

  test("is MAX_BLOCK_MAP_SIZE when the size is unknown or not a size", () => {
    for (const size of [null, undefined, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(blockMapSizeLimit(size), String(size)).toBe(MAX_BLOCK_MAP_SIZE)
    }
  })

  test("leaves room for the densest map electron-builder writes (v3, 512 B blocks of a stored asar)", () => {
    const fileSize = 64 * 1024 * 1024
    const blockCount = fileSize / 512
    // records, plus a group entry per 8 blocks (the group minimum) and a super-group entry per 4 groups
    const v3Size = 46 + blockCount * 10 + (blockCount / 8) * 16 + (blockCount / 32) * 16
    expect(v3Size * 2).toBeLessThan(blockMapSizeLimit(fileSize))
  })
})

// the old installer of 1000 bytes is cached with a matching block map; the update is 1100 bytes
describe("differentialDownloadInstaller rejects unusable block maps", { concurrent: false }, () => {
  const NEW_BLOCKMAP_URL = "https://example.com/TestApp-Setup-2.0.0.exe.blockmap"
  let cacheDir: string
  let updater: AppImageUpdater
  let log: ReturnType<typeof makeLogger>
  let servedNewBlockMap: Buffer
  let requests: Array<{ url: string; maxSize: number | undefined }>
  let planned: boolean

  beforeEach(async context => {
    log = makeLogger()
    cacheDir = await context.tmpDir.createTempDir({ prefix: "blockmap-hardening" })
    updater = new AppImageUpdater(null, stubApp)
    updater.logger = log
    ;(updater as any).downloadedUpdateHelper = new DownloadedUpdateHelper(cacheDir, log)
    servedNewBlockMap = gzippedJson(v2BlockMap([700, 400], "2.0.0"))
    requests = []
    planned = false
    ;(updater as any).httpExecutor = {
      downloadToBuffer: (url: URL, _options: unknown, maxSize?: number) => {
        requests.push({ url: url.href, maxSize })
        return Promise.resolve(servedNewBlockMap)
      },
    }
    vi.spyOn(GenericDifferentialDownloader.prototype, "download").mockImplementation(() => {
      planned = true
      return Promise.resolve()
    })
    await outputFile(path.join(cacheDir, OLD_INSTALLER_FILE_NAME), Buffer.alloc(1000))
    await outputFile(path.join(cacheDir, "current.blockmap"), gzippedJson(v2BlockMap([600, 400], "1.0.0")))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function differentialDownloadInstaller(info: { size?: number; blockMapSha512?: string } = {}): Promise<boolean> {
    const provider = {
      getBlockMapFiles: () => Promise.resolve([new URL("https://example.com/TestApp-Setup-1.0.0.exe.blockmap"), new URL(NEW_BLOCKMAP_URL)]),
      isUseMultipleRangeRequest: true,
    } as any
    const fileInfo = {
      url: new URL("https://example.com/TestApp-Setup-2.0.0.exe"),
      info: { url: "TestApp-Setup-2.0.0.exe", sha512: "sha512-of-2.0.0", size: 1100, ...info },
    }
    const downloadUpdateOptions = {
      updateInfoAndProvider: { info: { version: "2.0.0", files: [], path: "", sha512: "", releaseDate: "" }, provider },
      requestHeaders: {},
      cancellationToken: new CancellationToken(),
    }
    return (AppUpdater.prototype as any).differentialDownloadInstaller.call(
      updater,
      fileInfo,
      downloadUpdateOptions,
      path.join(cacheDir, "new.exe"),
      provider,
      OLD_INSTALLER_FILE_NAME
    )
  }

  // one line: the message, without a stack trace
  function expectOneLineFallback(message: string | RegExp) {
    const fallbacks = log.errors.filter(it => it.startsWith("Cannot download differentially, fallback to full download: "))
    expect(fallbacks).toHaveLength(1)
    expect(fallbacks[0]).not.toContain("\n")
    expect(fallbacks[0]).toMatch(message)
  }

  test("control: a block map that describes the update is planned on", async () => {
    expect(await differentialDownloadInstaller()).toBe(false)
    expect(planned).toBe(true)
    expect(log.errors).toEqual([])
  })

  test("a 0-byte update is downloaded in full without requesting a block map", async () => {
    expect(await differentialDownloadInstaller({ size: 0 })).toBe(true)
    expect(requests).toEqual([])
    expect(planned).toBe(false)
    expectOneLineFallback(/is 0 bytes/)
  })

  test("a new v2 block map without blocks is rejected", async () => {
    servedNewBlockMap = gzippedJson(v2BlockMap([], "2.0.0"))
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(/does not describe the 1100-byte update \(its blocks end at 0\)/)
  })

  test("a new v2 block map that ends before or after the update is rejected", async () => {
    for (const sizes of [
      [700, 300],
      [700, 500],
    ]) {
      log.errors.length = 0
      servedNewBlockMap = gzippedJson(v2BlockMap(sizes, "2.0.0"))
      expect(await differentialDownloadInstaller()).toBe(true)
      expectOneLineFallback(`its blocks end at ${sizes[0] + sizes[1]}`)
    }
    expect(planned).toBe(false)
  })

  test("a malformed new v2 block map is rejected before planning", async () => {
    servedNewBlockMap = gzippedJson({ version: "2", files: [{ name: "file", offset: 0, checksums: ["a"] }] })
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(/\(malformed\)/)
  })

  test("the block map download is bounded by the limit for the update's size", async () => {
    await differentialDownloadInstaller()
    expect(requests).toEqual([{ url: NEW_BLOCKMAP_URL, maxSize: blockMapSizeLimit(1100) }])
  })

  test("a gzip bomb is not decompressed past the limit", async () => {
    // ~2 MiB of JSON (more than the 1 MiB + 128 B limit of an 1100-byte update) in ~2 KiB of gzip
    const padding = " ".repeat(2 * 1024 * 1024)
    servedNewBlockMap = gzipSync(`{"version":"2","files":[${padding}]}`)
    expect(servedNewBlockMap.length).toBeLessThan(blockMapSizeLimit(1100))
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(`decompressed size exceeds the ${blockMapSizeLimit(1100)}-byte limit`)
  })

  test("a cached old map is decompressed within the limit for the cached installer's size", async () => {
    await outputFile(path.join(cacheDir, "current.blockmap"), gzipSync(`{"version":"2","files":[${" ".repeat(2 * 1024 * 1024)}]}`))
    // the cached map is ignored and the installed version's map is downloaded (served the same map here, so it does not match)
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(log.warns.some(it => it.includes(`decompressed size exceeds the ${blockMapSizeLimit(1000)}-byte limit`))).toBe(true)
    expect(requests.map(it => it.url)).toContain("https://example.com/TestApp-Setup-1.0.0.exe.blockmap")
    expect(requests.find(it => it.url.endsWith("1.0.0.exe.blockmap"))?.maxSize).toBe(blockMapSizeLimit(1000))
  })

  test("a compressed map larger than the limit is rejected without decompressing it", async () => {
    servedNewBlockMap = Buffer.alloc(blockMapSizeLimit(1100) + 1)
    expect(await differentialDownloadInstaller()).toBe(true)
    expectOneLineFallback(`${blockMapSizeLimit(1100) + 1} bytes, more than the ${blockMapSizeLimit(1100)}-byte limit`)
  })

  test("a new block map that matches the blockMapSha512 of the manifest is planned on (base64 and hex)", async () => {
    for (const encoding of ["base64", "hex"] as const) {
      planned = false
      expect(await differentialDownloadInstaller({ blockMapSha512: sha512(servedNewBlockMap, encoding) })).toBe(false)
      expect(planned).toBe(true)
    }
    expect(log.errors).toEqual([])
  })

  test("a new block map that does not match the blockMapSha512 of the manifest is neither planned on nor cached", async () => {
    const expected = sha512(gzippedJson(v2BlockMap([700, 400], "another 2.0.0")))
    expect(await differentialDownloadInstaller({ blockMapSha512: expected })).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(`does not match the blockMapSha512 of the update manifest (expected ${expected}, got ${sha512(servedNewBlockMap)})`)
    expect(await pathExists(path.join(cacheDir, "pending", "current.blockmap"))).toBe(false)
  })

  test("a cached empty block map does not pair with an empty installer", async () => {
    await outputFile(path.join(cacheDir, OLD_INSTALLER_FILE_NAME), Buffer.alloc(0))
    expect(await isBlockMapOfFile(v2BlockMap([], "1.0.0"), path.join(cacheDir, OLD_INSTALLER_FILE_NAME))).toBe(false)
    expect(await isBlockMapOfFile(v2BlockMap([], "1.0.0"), path.join(cacheDir, "missing.exe"))).toBe(false)
  })
})

describe("differential download plan", () => {
  test("an empty plan, or an update of zero or unknown size, is not downloaded", async context => {
    const dir = await context.tmpDir.createTempDir({ prefix: "blockmap-empty-plan" })
    const oldFile = path.join(dir, "old.exe")
    await outputFile(oldFile, Buffer.alloc(0))
    const empty = v2BlockMap([], "x")
    for (const size of [0, undefined, 1000]) {
      const downloader = new GenericDifferentialDownloader({ sha512: "unused", size }, {} as any, {
        oldFile,
        newFile: path.join(dir, "new.exe"),
        newUrl: new URL("https://example.com/update.exe"),
        logger: makeLogger(),
        requestHeaders: null,
        cancellationToken: new CancellationToken(),
      })
      // doDownload throws before it returns a promise
      const error = await Promise.resolve()
        .then(() => downloader.download(empty, empty))
        .then(
          () => null,
          (e: any) => e
        )
      expect(error?.code, String(size)).toBe("ERR_UPDATER_INVALID_BLOCKMAP")
    }
  })
})

// Deterministic synthetic blocks (same generator as blockMapV3Test)
function makeBlocks(count: number, seed: number, avgSize = 4096): Array<BlockInput> {
  const blocks: Array<BlockInput> = []
  let x = seed >>> 0
  let offset = 0
  for (let i = 0; i < count; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    const size = Math.floor(Math.max(64, Math.min(0xffff, avgSize + ((x % (avgSize * 2)) - avgSize) / 2)))
    blocks.push({ digest: blake2b(Buffer.from(`block-${seed}-${i}-${x}`), { dkLen: 18 }), size, offset })
    offset += size
  }
  return blocks
}

function encode(blocks: Array<BlockInput>): Buffer {
  return encodeBlockMapV3(blocks, { fileSize: blocks.reduce((sum, b) => sum + b.size, 0), defaultChunker: { min: 8192, avg: 16384, max: 32768 } })
}

// v3: the new map is assembled from Range requests against the cached old map, then checked against blockMapSha512 like a whole download
describe("blockMapSha512 of a v3 map fetched by Range requests", { concurrent: false }, () => {
  const OLD_BLOCKS = makeBlocks(2000, 1)
  // one block changed in the middle: only a few ranges of the new map are fetched
  const NEW_BLOCKS = OLD_BLOCKS.map((block, i) => (i === 1000 ? { ...block, digest: blake2b(Buffer.from("changed"), { dkLen: 18 }) } : block))
  const OLD_MAP = encode(OLD_BLOCKS)
  const NEW_MAP = encode(NEW_BLOCKS)
  const FILE_SIZE = OLD_BLOCKS.reduce((sum, b) => sum + b.size, 0)

  let server: http.Server
  let baseUrl: URL
  let requests: Array<string | null>
  let cacheDir: string
  let updater: AppImageUpdater
  let log: ReturnType<typeof makeLogger>
  let planned: boolean

  beforeEach(async context => {
    requests = []
    server = http.createServer((req, res) => {
      const range = req.headers.range ?? null
      requests.push(range)
      const m = range == null ? null : /^bytes=(\d+)-(\d+)$/.exec(range)
      if (m == null) {
        res.writeHead(200, { "Content-Length": NEW_MAP.length })
        res.end(NEW_MAP)
        return
      }
      const start = Number(m[1])
      const end = Math.min(Number(m[2]), NEW_MAP.length - 1)
      res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${NEW_MAP.length}`, "Content-Length": end - start + 1 })
      res.end(NEW_MAP.subarray(start, end + 1))
    })
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()))
    baseUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)

    log = makeLogger()
    cacheDir = await context.tmpDir.createTempDir({ prefix: "blockmap-v3-sha512" })
    updater = new AppImageUpdater(null, stubApp)
    updater.logger = log
    ;(updater as any).downloadedUpdateHelper = new DownloadedUpdateHelper(cacheDir, log)
    ;(updater as any).httpExecutor = httpExecutor
    planned = false
    vi.spyOn(GenericDifferentialDownloader.prototype, "download").mockImplementation(() => {
      planned = true
      return Promise.resolve()
    })
    await outputFile(path.join(cacheDir, OLD_INSTALLER_FILE_NAME), Buffer.alloc(FILE_SIZE))
    await outputFile(path.join(cacheDir, "current.blockmap"), OLD_MAP)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  function differentialDownloadInstaller(blockMapSha512: string): Promise<boolean> {
    const newBlockMapUrl = new URL("TestApp-2.0.0.AppImage.blockmap", baseUrl)
    const provider = { getBlockMapFiles: () => Promise.resolve([new URL("TestApp-1.0.0.AppImage.blockmap", baseUrl), newBlockMapUrl]), isUseMultipleRangeRequest: false } as any
    const fileInfo = { url: new URL("TestApp-2.0.0.AppImage", baseUrl), info: { url: "TestApp-2.0.0.AppImage", sha512: "sha512-of-2.0.0", size: FILE_SIZE, blockMapSha512 } }
    const downloadUpdateOptions = {
      updateInfoAndProvider: { info: { version: "2.0.0", files: [], path: "", sha512: "", releaseDate: "" }, provider },
      requestHeaders: {},
      cancellationToken: new CancellationToken(),
    }
    return (AppUpdater.prototype as any).differentialDownloadInstaller.call(
      updater,
      fileInfo,
      downloadUpdateOptions,
      path.join(cacheDir, "new.AppImage"),
      provider,
      OLD_INSTALLER_FILE_NAME
    )
  }

  test("the assembled map is verified: a match plans the update from Range requests only", async () => {
    expect(await differentialDownloadInstaller(sha512(NEW_MAP))).toBe(false)
    expect(planned).toBe(true)
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every(it => it != null)).toBe(true)
    expect(log.warns).toEqual([])
  })

  test("a mismatch retries with the whole map, then downloads the update in full", async () => {
    const expected = sha512(OLD_MAP)
    expect(await differentialDownloadInstaller(expected)).toBe(true)
    expect(planned).toBe(false)
    // the Range requests, then one plain GET of the whole map
    expect(requests.filter(it => it == null)).toHaveLength(1)
    expect(log.warns.some(it => it.startsWith("Cannot fetch the changed parts of the block map") && it.includes("blockMapSha512"))).toBe(true)
    expect(log.errors.filter(it => it.includes(`does not match the blockMapSha512 of the update manifest (expected ${expected}`))).toHaveLength(1)
  })
})
