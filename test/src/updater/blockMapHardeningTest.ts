import { blake2b } from "@noble/hashes/blake2.js"
import { CancellationToken, DownloadOptions } from "builder-util-runtime"
import { BlockInput, encodeBlockMapV3, parseBlockMapV3Header } from "builder-util-runtime/internal"
import { AppImageUpdater } from "electron-updater"
import { AppUpdater, isBlockMapOfFile } from "electron-updater/src/AppUpdater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { blockMapSizeLimit } from "electron-updater/src/differentialDownloader/DifferentialDownloader"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { fetchBlockMapV3, firstRangeSize } from "electron-updater/src/differentialDownloader/blockMapV3Fetcher"
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
const MiB = 1024 * 1024
const sha512 = (data: Buffer, encoding: "base64" | "hex" = "base64") => createHash("sha512").update(data).digest(encoding)
const v2BlockMap = (sizes: Array<number>, tag: string) => ({ version: "2" as const, files: [{ name: "file", offset: 0, checksums: sizes.map((_, i) => `${tag}-${i}`), sizes }] })
const gzippedJson = (value: unknown) => gzipSync(JSON.stringify(value))
/** valid gzip of more than 8 MiB of JSON (the limit for a small update) in a few KB */
const gzipBomb = () => gzipSync(`{"version":"2","files":[${" ".repeat(9 * MiB)}]}`)

/** one line, without a stack trace: the message of an ERR_UPDATER_INVALID_BLOCKMAP */
function expectOneLineFallback(log: ReturnType<typeof makeLogger>, message: string | RegExp) {
  const fallbacks = log.errors.filter(it => it.startsWith("Cannot download differentially, fallback to full download: "))
  expect(fallbacks).toHaveLength(1)
  expect(fallbacks[0]).not.toContain("\n")
  expect(fallbacks[0]).toMatch(message)
}

// the old installer of 1000 bytes is cached with a matching block map; the update is 1100 bytes
describe("differentialDownloadInstaller rejects unusable block maps", { concurrent: false }, () => {
  const OLD_BLOCKMAP_URL = "https://example.com/TestApp-Setup-1.0.0.exe.blockmap"
  const NEW_BLOCKMAP_URL = "https://example.com/TestApp-Setup-2.0.0.exe.blockmap"
  let cacheDir: string
  let updater: AppImageUpdater
  let log: ReturnType<typeof makeLogger>
  let servedNewBlockMap: Buffer
  let servedOldBlockMap: Buffer
  let blockMapFilesResolved: number
  let requests: Array<{ url: string; maxSize: number | null | undefined }>
  let planned: boolean

  beforeEach(async context => {
    log = makeLogger()
    cacheDir = await context.tmpDir.createTempDir({ prefix: "blockmap-hardening" })
    updater = new AppImageUpdater(null, stubApp)
    updater.logger = log
    ;(updater as any).downloadedUpdateHelper = new DownloadedUpdateHelper(cacheDir, log)
    servedNewBlockMap = gzippedJson(v2BlockMap([700, 400], "2.0.0"))
    servedOldBlockMap = gzippedJson(v2BlockMap([600, 400], "1.0.0"))
    requests = []
    planned = false
    blockMapFilesResolved = 0
    ;(updater as any).httpExecutor = {
      downloadToBuffer: (url: URL, options: DownloadOptions) => {
        requests.push({ url: url.href, maxSize: options.maxSize })
        return Promise.resolve(url.href === OLD_BLOCKMAP_URL ? servedOldBlockMap : servedNewBlockMap)
      },
    }
    vi.spyOn(GenericDifferentialDownloader.prototype, "download").mockImplementation(() => {
      planned = true
      return Promise.resolve()
    })
    await outputFile(path.join(cacheDir, OLD_INSTALLER_FILE_NAME), Buffer.alloc(1000))
    await outputFile(path.join(cacheDir, "current.blockmap"), servedOldBlockMap)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function differentialDownloadInstaller(info: { size?: number; blockMapSha512?: string } = {}, fileUrl = "https://example.com/TestApp-Setup-2.0.0.exe"): Promise<boolean> {
    const provider = {
      getBlockMapFiles: () => {
        blockMapFilesResolved++
        return Promise.resolve([new URL(OLD_BLOCKMAP_URL), new URL(NEW_BLOCKMAP_URL)])
      },
      isUseMultipleRangeRequest: true,
      feedBaseUrl: new URL("https://example.com/"),
    } as any
    const fileInfo = {
      url: new URL(fileUrl),
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

  test("control: a block map that describes the update is planned on", async () => {
    expect(await differentialDownloadInstaller()).toBe(false)
    expect(planned).toBe(true)
    expect(log.errors).toEqual([])
  })

  test.for([
    [0, "0 bytes"],
    [undefined, "unknown"],
    [Number.NaN, "invalid (NaN)"],
    [-1, "invalid (-1)"],
    [1.5, "invalid (1.5)"],
  ] as const)("an update of size %s is downloaded in full without resolving or requesting a block map", async ([size, described]) => {
    expect(await differentialDownloadInstaller({ size })).toBe(true)
    expect(blockMapFilesResolved).toBe(0)
    expect(requests).toEqual([])
    expect(planned).toBe(false)
    expectOneLineFallback(log, `The size of the update "https://example.com/TestApp-Setup-2.0.0.exe" is ${described}, it cannot be downloaded differentially`)
  })

  test("the size error names the update without its query, which may hold a pre-signed URL's signature", async () => {
    expect(await differentialDownloadInstaller({ size: undefined }, "https://example.com/TestApp-Setup-2.0.0.exe?X-Amz-Signature=secret")).toBe(true)
    expectOneLineFallback(log, `The size of the update "https://example.com/TestApp-Setup-2.0.0.exe" is unknown`)
    expect(log.errors.join(" ")).not.toContain("secret")
  })

  test("an empty new block map body is rejected", async () => {
    servedNewBlockMap = Buffer.alloc(0)
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, `Blockmap "${NEW_BLOCKMAP_URL}" is empty`)
  })

  test("a new v2 block map without blocks is rejected", async () => {
    servedNewBlockMap = gzippedJson(v2BlockMap([], "2.0.0"))
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, /does not describe the 1100-byte update \(its blocks end at 0\)/)
  })

  test.for([
    [700, 300],
    [700, 500],
  ])("a new v2 block map whose blocks end at %i + %i, not at the update's size, is rejected", async sizes => {
    servedNewBlockMap = gzippedJson(v2BlockMap(sizes, "2.0.0"))
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, `its blocks end at ${sizes[0] + sizes[1]}`)
  })

  test("a malformed new v2 block map is rejected before planning", async () => {
    servedNewBlockMap = gzippedJson({ version: "2", files: [{ name: "file", offset: 0, checksums: ["a"] }] })
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, /\(malformed\)/)
  })

  test("a new block map that inflates past the limit is rejected with one line", async () => {
    servedNewBlockMap = gzipBomb()
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, `Cannot parse blockmap "${NEW_BLOCKMAP_URL}"`)
  })

  test("an old block map from the server that inflates past the limit falls back to a full download", async () => {
    await outputFile(path.join(cacheDir, "current.blockmap"), Buffer.alloc(0))
    servedOldBlockMap = gzipBomb()
    expect(await differentialDownloadInstaller()).toBe(true)
    expect(planned).toBe(false)
    expect(requests).toEqual([
      { url: NEW_BLOCKMAP_URL, maxSize: blockMapSizeLimit(1100) },
      { url: OLD_BLOCKMAP_URL, maxSize: blockMapSizeLimit(1100) },
    ])
    expectOneLineFallback(log, `Cannot parse blockmap "${OLD_BLOCKMAP_URL}"`)
  })

  test("a new block map that matches the base64 blockMapSha512 of the manifest is planned on", async () => {
    expect(await differentialDownloadInstaller({ blockMapSha512: sha512(servedNewBlockMap) })).toBe(false)
    expect(planned).toBe(true)
    expect(log.errors).toEqual([])
  })

  // blockMapSha512 is base64 only: unlike sha512 it never had a hex producer, so a hex value is a mismatch
  test("a hex blockMapSha512 of the right block map is a mismatch", async () => {
    expect(await differentialDownloadInstaller({ blockMapSha512: sha512(servedNewBlockMap, "hex") })).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, "does not match the blockMapSha512 of the update manifest")
  })

  test("a new block map that does not match the blockMapSha512 of the manifest is neither planned on nor cached", async () => {
    const expected = sha512(gzippedJson(v2BlockMap([700, 400], "another 2.0.0")))
    expect(await differentialDownloadInstaller({ blockMapSha512: expected })).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, `does not match the blockMapSha512 of the update manifest (expected ${JSON.stringify(expected)}, got ${sha512(servedNewBlockMap)})`)
    expect(await pathExists(path.join(cacheDir, "pending", "current.blockmap"))).toBe(false)
  })

  test("an empty blockMapSha512 is a mismatch, not a missing value", async () => {
    expect(await differentialDownloadInstaller({ blockMapSha512: "" })).toBe(true)
    expect(planned).toBe(false)
    expectOneLineFallback(log, "does not match the blockMapSha512 of the update manifest")
  })

  // blockMapSha512 is not covered by the manifest signature, so the error (logged before the fallback) quotes it: a forged value
  // cannot start a new log line or inject terminal escapes
  test("an unsigned blockMapSha512 with control characters is quoted in the mismatch error", async () => {
    updater._testOnlyOptions = { platform: "linux", isUseDifferentialDownload: true }
    const expected = "abc\nCannot download differentially: forged\u001b[31mred\u001b[0m"
    const error = await differentialDownloadInstaller({ blockMapSha512: expected }).then(
      () => null,
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(Error)
    expect(error).toHaveProperty("code", "ERR_UPDATER_INVALID_BLOCKMAP")
    const message = error instanceof Error ? error.message : ""
    expect(message).toContain(`(expected ${JSON.stringify(expected)}, got ${sha512(servedNewBlockMap)})`)
    expect(message).toContain(String.raw`"abc\nCannot download differentially: forged\u001b[31mred\u001b[0m"`)
    expect(message).not.toContain("\n")
    expect(message).not.toContain("\u001b")
    expect(planned).toBe(false)
  })

  test("an empty block map does not pair with an empty or missing installer", async () => {
    await outputFile(path.join(cacheDir, OLD_INSTALLER_FILE_NAME), Buffer.alloc(0))
    expect(await isBlockMapOfFile(v2BlockMap([], "1.0.0"), path.join(cacheDir, OLD_INSTALLER_FILE_NAME))).toBe(false)
    expect(await isBlockMapOfFile(v2BlockMap([], "1.0.0"), path.join(cacheDir, "missing.exe"))).toBe(false)
  })
})

describe("differential download plan", () => {
  test.for([0, undefined, Number.NaN, -1, 1000])("an empty plan for an update of size %s is not downloaded", async (size, context) => {
    const dir = await context.tmpDir.createTempDir({ prefix: "blockmap-empty-plan" })
    const oldFile = path.join(dir, "old.exe")
    await outputFile(oldFile, Buffer.alloc(0))
    const empty = v2BlockMap([], "x")
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
        (e: unknown) => e
      )
    expect(error).toMatchObject({ code: "ERR_UPDATER_INVALID_BLOCKMAP" })
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

/** serves `file` with single-range support (206 + Content-Range), recording the Range header of every request */
async function serve(file: () => Buffer): Promise<{ url: URL; requests: Array<string | null>; close: () => Promise<void> }> {
  const requests: Array<string | null> = []
  const server = http.createServer((req, res) => {
    const body = file()
    const range = req.headers.range ?? null
    requests.push(range)
    const m = range == null ? null : /^bytes=(\d+)-(\d+)$/.exec(range)
    if (m == null) {
      res.writeHead(200, { "Content-Length": body.length })
      res.end(body)
      return
    }
    const start = Number(m[1])
    const end = Math.min(Number(m[2]), body.length - 1)
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${body.length}`, "Content-Length": end - start + 1 })
    res.end(body.subarray(start, end + 1))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()))
  return {
    url: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`),
    requests,
    close: () => {
      server.closeAllConnections()
      return new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

describe("block map fetcher size limit", () => {
  test("a response that is not a v3 map and whose Content-Range total is past the limit is rejected after the first request", async () => {
    const oldMap = encode(makeBlocks(2000, 1))
    const limit = firstRangeSize(parseBlockMapV3Header(oldMap)) + 10
    // a v2 map (gzip) one byte past the limit
    const served = Buffer.concat([gzipSync("{}"), Buffer.alloc(limit)]).subarray(0, limit + 1)
    const server = await serve(() => served)
    try {
      const fetching = fetchBlockMapV3({ url: new URL("new.blockmap", server.url), oldMap, maxBlockMapSize: limit, httpExecutor, cancellationToken: new CancellationToken() })
      await expect(fetching).rejects.toThrow(`is ${limit + 1} bytes, more than the ${limit}-byte limit`)
      expect(server.requests).toHaveLength(1)
    } finally {
      await server.close()
    }
  })
})

// v3: the new map is assembled from Range requests against the cached old map, then checked against blockMapSha512 like a whole download
describe("blockMapSha512 of a v3 map fetched by Range requests", { concurrent: false }, () => {
  const OLD_BLOCKS = makeBlocks(2000, 1)
  // one block changed in the middle: only a few ranges of the new map are fetched
  const NEW_BLOCKS = OLD_BLOCKS.map((block, i) => (i === 1000 ? { ...block, digest: blake2b(Buffer.from("changed"), { dkLen: 18 }) } : block))
  const OLD_MAP = encode(OLD_BLOCKS)
  const NEW_MAP = encode(NEW_BLOCKS)
  const FILE_SIZE = OLD_BLOCKS.reduce((sum, b) => sum + b.size, 0)

  let server: Awaited<ReturnType<typeof serve>>
  let cacheDir: string
  let updater: AppImageUpdater
  let log: ReturnType<typeof makeLogger>
  let planned: boolean

  beforeEach(async context => {
    server = await serve(() => NEW_MAP)
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
    await server.close()
  })

  function differentialDownloadInstaller(blockMapSha512: string): Promise<boolean> {
    const newBlockMapUrl = new URL("TestApp-2.0.0.AppImage.blockmap", server.url)
    const provider = {
      getBlockMapFiles: () => Promise.resolve([new URL("TestApp-1.0.0.AppImage.blockmap", server.url), newBlockMapUrl]),
      isUseMultipleRangeRequest: false,
      feedBaseUrl: server.url,
    } as any
    const fileInfo = { url: new URL("TestApp-2.0.0.AppImage", server.url), info: { url: "TestApp-2.0.0.AppImage", sha512: "sha512-of-2.0.0", size: FILE_SIZE, blockMapSha512 } }
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
    expect(server.requests.length).toBeGreaterThan(0)
    expect(server.requests.every(it => it != null)).toBe(true)
    expect(log.warns).toEqual([])
  })

  test("a mismatch retries with the whole map, then downloads the update in full", async () => {
    const expected = sha512(OLD_MAP)
    expect(await differentialDownloadInstaller(expected)).toBe(true)
    expect(planned).toBe(false)
    // the Range requests, then one plain GET of the whole map
    expect(server.requests.filter(it => it == null)).toHaveLength(1)
    expect(log.warns.some(it => it.startsWith("Cannot fetch the changed parts of the block map") && it.includes("blockMapSha512"))).toBe(true)
    expectOneLineFallback(log, `does not match the blockMapSha512 of the update manifest (expected ${JSON.stringify(expected)}`)
  })
})
