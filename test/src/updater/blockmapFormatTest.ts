import { blake2b } from "@noble/hashes/blake2.js"
import { BlockMap, CancellationToken, GenericServerOptions, UpdateInfo } from "builder-util-runtime"
import { BlockInput, encodeBlockMapV3 } from "builder-util-runtime/internal"
import { AppUpdater } from "electron-updater"
import type { DownloadUpdateOptions } from "electron-updater/src/AppUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { createClient } from "electron-updater/src/providerFactory"
import { Provider } from "electron-updater/src/providers/Provider"
import fsExtra from "fs-extra"
import * as http from "http"
import type { IncomingHttpHeaders, IncomingMessage, Server } from "http"
import type { AddressInfo } from "net"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, test, vi } from "vitest"
import { gunzipSync, gzipSync } from "zlib"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, httpExecutor, makeLogger, tuneTestUpdater } from "../helpers/updaterTestUtil.js"

// One `.blockmap` per artifact, in the format the `blockmap` option chose: the updater tells v2 (gzipped JSON) from v3 (the
// binary range-fetchable map) by the file's first bytes, range-fetches a v3 map against a cached v3 map, and falls back to a full
// download when the old and new maps are in different formats.

function makeBlocks(count: number, seed: number): Array<BlockInput> {
  const blocks: Array<BlockInput> = []
  let x = seed >>> 0
  let offset = 0
  for (let i = 0; i < count; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    const size = 2048 + (x % 4096)
    blocks.push({ digest: blake2b(Buffer.from(`block-${seed}-${i}-${x}`), { dkLen: 18 }), size, offset })
    offset += size
  }
  return blocks
}

function v3Map(blocks: Array<BlockInput>): Buffer {
  let offset = 0
  const placed = blocks.map(b => {
    const result = { ...b, offset }
    offset += b.size
    return result
  })
  return encodeBlockMapV3(placed, { fileSize: offset, defaultChunker: { min: 8192, avg: 16384, max: 32768 } })
}

function v2Map(blocks: Array<BlockInput>): Buffer {
  const map: BlockMap = {
    version: "2",
    files: [{ name: "file", offset: 0, checksums: blocks.map(b => Buffer.from(b.digest).toString("base64")), sizes: blocks.map(b => b.size) }],
  }
  return gzipSync(JSON.stringify(map))
}

/** `map` (a v2 map) padded with 100 MiB of whitespace: still a valid map, a few hundred KB of gzip that inflates far past any blockmap's size. */
function inflatingV2Map(map: Buffer): Buffer {
  return gzipSync(Buffer.concat([gunzipSync(map), Buffer.alloc(100 * 1024 * 1024, " ")]))
}

describe("block map format detection", () => {
  const OLD_BLOCKS = makeBlocks(3000, 1)
  // a few blocks changed, so most of the v3 map is reused from the cached one
  const NEW_BLOCKS = OLD_BLOCKS.map((b, i) => (i % 700 === 5 ? { ...b, digest: blake2b(Buffer.from(`changed-${i}`), { dkLen: 18 }) } : b))
  const OLD_V2 = v2Map(OLD_BLOCKS)
  const NEW_V2 = v2Map(NEW_BLOCKS)
  const OLD_V3 = v3Map(OLD_BLOCKS)
  const NEW_V3 = v3Map(NEW_BLOCKS)
  // the update's `size` in the manifest: a v3 map describing another size is rejected
  const NEW_SIZE = NEW_BLOCKS.reduce((sum, b) => sum + b.size, 0)

  const servers: Array<Server> = []
  afterEach(() => {
    vi.restoreAllMocks()
    for (const server of servers.splice(0)) {
      server.close()
    }
  })

  async function serve(tmpDir: TmpDir, files: { old?: Buffer; new: Buffer }) {
    const root = await tmpDir.getTempDir({ prefix: "blockmap-format-server" })
    if (files.old != null) {
      await fsExtra.outputFile(path.join(root, "app-1.0.0.exe.blockmap"), files.old)
    }
    await fsExtra.outputFile(path.join(root, "app-1.1.0.exe.blockmap"), files.new)
    const { server, port } = await createLocalServer(root)
    servers.push(server)
    const requests: Array<{ pathname: string; headers: IncomingHttpHeaders }> = []
    server.on("request", (request: IncomingMessage) => {
      requests.push({ pathname: new URL(request.url!, "http://localhost").pathname, headers: request.headers })
    })
    return { url: `http://127.0.0.1:${port}/`, requests }
  }

  /** A host that answers every Range request with 416 and a plain GET with the file. */
  async function serveRejectingRanges(files: Record<string, Buffer>) {
    const requests: Array<{ pathname: string; range: string | null; status: number }> = []
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url!, "http://localhost").pathname
      const file = files[pathname.substring(1)]
      const status = file == null ? 404 : req.headers.range == null ? 200 : 416
      requests.push({ pathname, range: req.headers.range ?? null, status })
      res.writeHead(status, status === 200 ? { "Content-Length": file.length } : {})
      res.end(status === 200 ? file : undefined)
    })
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    servers.push(server)
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, requests }
  }

  function captureLog(updater: AppUpdater) {
    const messages: Record<"info" | "warn" | "error", Array<string>> = { info: [], warn: [], error: [] }
    updater.logger = {
      info: (message?: any) => messages.info.push(String(message)),
      warn: (message?: any) => messages.warn.push(String(message)),
      error: (message?: any) => messages.error.push(String(message)),
    }
    return messages
  }

  async function setUp(tmpDir: TmpDir, cached: Buffer | null) {
    const updater = await createNsisUpdater("1.0.0")
    tuneTestUpdater(updater, { platform: "win32", isUseDifferentialDownload: true })
    const helper = new DownloadedUpdateHelper(await tmpDir.getTempDir({ prefix: "blockmap-format-cache" }), makeLogger())
    ;(updater as any).downloadedUpdateHelper = helper
    ;(updater as any).httpExecutor = httpExecutor
    if (cached != null) {
      await fsExtra.outputFile(path.join(helper.cacheDir, "current.blockmap"), cached)
    }
    const maps: Array<{ old: BlockMap; new: BlockMap }> = []
    vi.spyOn(GenericDifferentialDownloader.prototype, "download").mockImplementation((oldMap: BlockMap, newMap: BlockMap) => {
      maps.push({ old: oldMap, new: newMap })
      return Promise.resolve()
    })
    return { updater, helper, maps }
  }

  function run(updater: AppUpdater, feedUrl: string, tmpDir: TmpDir) {
    const options: GenericServerOptions = { provider: "generic", url: feedUrl }
    const provider: Provider<any> = createClient(options, updater, {
      isUseMultipleRangeRequest: false,
      platform: "win32",
      executor: {} as any,
    })
    const info: UpdateInfo = { version: "1.1.0", files: [{ url: "app-1.1.0.exe", sha512: "x", size: NEW_SIZE }], releaseDate: "2024-01-01T00:00:00.000Z" }
    const downloadOptions: DownloadUpdateOptions = {
      updateInfoAndProvider: { info, provider },
      requestHeaders: (updater as any).computeRequestHeaders(provider),
      cancellationToken: new CancellationToken(),
    }
    const fileInfo = provider.resolveFiles(info)[0]
    return tmpDir
      .getTempDir({ prefix: "blockmap-format-installer" })
      .then(dir => (updater as any).differentialDownloadInstaller(fileInfo, downloadOptions, path.join(dir, "installer.exe"), provider, "installer.exe") as Promise<boolean>)
  }

  const pending = (helper: DownloadedUpdateHelper) => fsExtra.readFile(path.join(helper.cacheDirForPendingUpdate, "current.blockmap"))

  test("v2 cached, v2 published: the new map is downloaded whole and compared to the cached one", async ({ tmpDir, expect }) => {
    const server = await serve(tmpDir, { new: NEW_V2 })
    const { updater, helper, maps } = await setUp(tmpDir, OLD_V2)

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    expect(server.requests.map(it => [it.pathname, it.headers.range ?? null])).toEqual([["/app-1.1.0.exe.blockmap", null]])
    expect(maps).toHaveLength(1)
    expect(maps[0].old.files[0].sizes).toEqual(OLD_BLOCKS.map(b => b.size))
    expect(maps[0].new.files[0].checksums).toEqual(NEW_BLOCKS.map(b => Buffer.from(b.digest).toString("base64")))
    expect((await pending(helper)).equals(NEW_V2)).toBe(true)
  })

  test("v3 cached, v3 published: only the changed parts of the new map are fetched, by Range, and the old map is not requested", async ({ tmpDir, expect }) => {
    const server = await serve(tmpDir, { old: OLD_V3, new: NEW_V3 })
    const { updater, helper, maps } = await setUp(tmpDir, OLD_V3)

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    expect(server.requests.length).toBeGreaterThan(0)
    for (const request of server.requests) {
      expect(request.pathname).toBe("/app-1.1.0.exe.blockmap")
      expect(request.headers.range).toMatch(/^bytes=/)
    }
    expect(maps).toHaveLength(1)
    expect(maps[0].new.files[0].sizes).toEqual(NEW_BLOCKS.map(b => b.size))
    expect(maps[0].old.files[0].sizes).toEqual(OLD_BLOCKS.map(b => b.size))
    // the reconstructed map is byte-identical to the published one, and cached for the next update
    expect((await pending(helper)).equals(NEW_V3)).toBe(true)
  })

  test("no cached map, v3 published: both maps are downloaded whole, the new one first", async ({ tmpDir, expect }) => {
    const server = await serve(tmpDir, { old: OLD_V3, new: NEW_V3 })
    const { updater, helper, maps } = await setUp(tmpDir, null)

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    expect(server.requests.map(it => [it.pathname, it.headers.range ?? null])).toEqual([
      ["/app-1.1.0.exe.blockmap", null],
      ["/app-1.0.0.exe.blockmap", null],
    ])
    expect(maps).toHaveLength(1)
    expect((await pending(helper)).equals(NEW_V3)).toBe(true)
  })

  /** The key a v3 map gives a block: the hex of the first 8 bytes of its blake2b-18 digest, which a v2 map stores whole. */
  const v3Keys = (blocks: Array<BlockInput>) => blocks.map(b => Buffer.from(b.digest.subarray(0, 8)).toString("hex"))

  test.for([
    // the new map is downloaded whole: no Range request against a cached map of the other format
    { name: "v2 cached, v3 published (the first release built with a newer format)", cached: OLD_V2, published: NEW_V3, ranges: [/^$/] },
    // the Range fetch against the cached v3 map finds a v2 map and completes its download
    { name: "v3 cached, v2 published (a release built with blockmap: v2 again)", cached: OLD_V3, published: NEW_V2, ranges: [/^bytes=0-2047$/, /^bytes=2048-\d+$/] },
  ])("$name: the blocks are compared by the v3 hash both maps carry; the new map is cached as published", async ({ cached, published, ranges }, { tmpDir, expect }) => {
    const server = await serve(tmpDir, { new: published })
    const { updater, helper, maps } = await setUp(tmpDir, cached)
    const log = captureLog(updater)

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    expect(server.requests).toHaveLength(ranges.length)
    server.requests.forEach((request, i) => {
      expect(request.pathname).toBe("/app-1.1.0.exe.blockmap")
      expect(request.headers.range ?? "").toMatch(ranges[i])
    })
    expect(maps).toHaveLength(1)
    expect(maps[0].old.files[0]).toEqual({ name: "file", offset: 0, checksums: v3Keys(OLD_BLOCKS), sizes: OLD_BLOCKS.map(b => b.size) })
    expect(maps[0].new.files[0]).toEqual({ name: "file", offset: 0, checksums: v3Keys(NEW_BLOCKS), sizes: NEW_BLOCKS.map(b => b.size) })
    expect((await pending(helper)).equals(published)).toBe(true)
    const formatChanged = log.info.filter(it => it.includes("Block map format changed"))
    expect(formatChanged).toEqual([expect.stringContaining("comparing the blocks by the v3 block hashes both maps carry")])
    expect(log.warn).toEqual([])
    expect(log.error).toEqual([])
  })

  test("no cached map, v3 published, the installed release's map on the server is v2: compared across formats as well", async ({ tmpDir, expect }) => {
    const server = await serve(tmpDir, { old: OLD_V2, new: NEW_V3 })
    const { updater, maps } = await setUp(tmpDir, null)

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    expect(server.requests.map(it => it.pathname)).toEqual(["/app-1.1.0.exe.blockmap", "/app-1.0.0.exe.blockmap"])
    expect(maps).toHaveLength(1)
    expect(maps[0].old.files[0].checksums).toEqual(v3Keys(OLD_BLOCKS))
    expect(maps[0].new.files[0].checksums).toEqual(v3Keys(NEW_BLOCKS))
  })

  // a v2 map whose checksums are not the blake2b-18 digests electron-builder writes (here, 32-byte digests) cannot be compared
  const FOREIGN_OLD_V2 = v2Map(OLD_BLOCKS.map(b => ({ ...b, digest: blake2b(b.digest, { dkLen: 32 }) })))
  const FOREIGN_NEW_V2 = v2Map(NEW_BLOCKS.map(b => ({ ...b, digest: blake2b(b.digest, { dkLen: 32 }) })))

  test.for([
    { name: "v2 cached, v3 published", cached: FOREIGN_OLD_V2, published: NEW_V3, side: "old" },
    { name: "v3 cached, v2 published", cached: OLD_V3, published: FOREIGN_NEW_V2, side: "new" },
  ])(
    "$name, the v2 map does not carry v3 block hashes: no block comparison; the new map is still cached for the next update",
    async ({ cached, published, side }, { tmpDir, expect }) => {
      const server = await serve(tmpDir, { new: published })
      const { updater, helper, maps } = await setUp(tmpDir, cached)

      const log = captureLog(updater)

      // outside test mode this is the fallback to a full download (`differentialDownloadInstaller` returns true)
      await expect(run(updater, server.url, tmpDir)).rejects.toMatchObject({ code: "ERR_UPDATER_BLOCKMAP_FORMAT_CHANGED" })

      expect(maps).toHaveLength(0)
      expect((await pending(helper)).equals(published)).toBe(true)
      // an expected one-time event: one info line without a stack, not the error a failed differential download logs
      const formatChanged = log.info.filter(it => it.includes("Block map format changed"))
      expect(formatChanged).toHaveLength(1)
      expect(formatChanged[0]).toContain(`the ${side} v2 map cannot be compared with a v3 map (v2 block #0 checksum is not a base64 blake2b-18 digest)`)
      expect(formatChanged[0]).toContain("downloading this update in full; the next one is differential again")
      expect(formatChanged[0]).not.toMatch(/\n\s+at /)
      expect(log.error).toEqual([])
    }
  )

  test("outside test mode, a v2 map that cannot be compared with the v3 map falls back to a full download", async ({ tmpDir, expect }) => {
    const server = await serve(tmpDir, { new: NEW_V3 })
    const { updater, maps } = await setUp(tmpDir, FOREIGN_OLD_V2)
    ;(updater as any)._testOnlyOptions = null

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(true)
    expect(maps).toHaveLength(0)
  })

  test("v3 cached, Range fetch of the new map fails: the new map is downloaded whole and the update is still differential", async ({ tmpDir, expect }) => {
    const server = await serveRejectingRanges({ "app-1.1.0.exe.blockmap": NEW_V3 })
    const { updater, helper, maps } = await setUp(tmpDir, OLD_V3)
    const log = captureLog(updater)

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    expect(server.requests).toEqual([
      { pathname: "/app-1.1.0.exe.blockmap", range: expect.stringMatching(/^bytes=0-/), status: 416 },
      { pathname: "/app-1.1.0.exe.blockmap", range: null, status: 200 },
    ])
    expect(log.warn).toEqual([expect.stringContaining("Cannot fetch the changed parts of the block map")])
    expect(maps).toHaveLength(1)
    expect(maps[0].new.files[0].sizes).toEqual(NEW_BLOCKS.map(b => b.size))
    expect((await pending(helper)).equals(NEW_V3)).toBe(true)
  })

  test.for([
    { name: "no cached map", cached: null },
    { name: "v2 cached", cached: OLD_V2 },
    { name: "v3 cached (the new map is range-fetched first)", cached: OLD_V3 },
  ])("$name: a new map that inflates past the size limit for the update is rejected before it is inflated in full", async ({ cached }, { tmpDir, expect }) => {
    const server = await serve(tmpDir, { old: OLD_V2, new: inflatingV2Map(NEW_V2) })
    const { updater, helper, maps } = await setUp(tmpDir, cached)
    captureLog(updater)

    // outside test mode this is the fallback to a full download
    await expect(run(updater, server.url, tmpDir)).rejects.toThrow(/Cannot parse blockmap ".*app-1\.1\.0\.exe\.blockmap".*ERR_BUFFER_TOO_LARGE/)

    expect(maps).toHaveLength(0)
    expect(await fsExtra.pathExists(path.join(helper.cacheDirForPendingUpdate, "current.blockmap"))).toBe(false)
  })

  test("a cached map that inflates past the size limit is ignored, and the installed release's map is downloaded", async ({ tmpDir, expect }) => {
    const server = await serve(tmpDir, { old: OLD_V2, new: NEW_V2 })
    const { updater, maps } = await setUp(tmpDir, inflatingV2Map(OLD_V2))
    const log = captureLog(updater)

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    expect(log.warn).toEqual([expect.stringMatching(/Cannot parse blockmap ".*current\.blockmap".*ERR_BUFFER_TOO_LARGE/)])
    expect(server.requests.map(it => [it.pathname, it.headers.range ?? null])).toEqual([
      ["/app-1.1.0.exe.blockmap", null],
      ["/app-1.0.0.exe.blockmap", null],
    ])
    expect(maps).toHaveLength(1)
    expect(maps[0].old.files[0].sizes).toEqual(OLD_BLOCKS.map(b => b.size))
  })

  test("a cached v3 map of another release (it does not end at the cached installer's size) is ignored, and the installed release's map is downloaded", async ({
    tmpDir,
    expect,
  }) => {
    const server = await serve(tmpDir, { old: OLD_V3, new: NEW_V3 })
    // the pending release's map was promoted, but installer.exe is still the installed release
    const STALE_V3 = v3Map(makeBlocks(2000, 9))
    const { updater, helper, maps } = await setUp(tmpDir, STALE_V3)
    await fsExtra.outputFile(path.join(helper.cacheDir, "installer.exe"), Buffer.alloc(OLD_BLOCKS.reduce((sum, b) => sum + b.size, 0)))

    await expect(run(updater, server.url, tmpDir)).resolves.toBe(false)

    // no cached map to compare against: the new map whole, then the installed release's map
    expect(server.requests.map(it => [it.pathname, it.headers.range ?? null])).toEqual([
      ["/app-1.1.0.exe.blockmap", null],
      ["/app-1.0.0.exe.blockmap", null],
    ])
    expect(maps).toHaveLength(1)
    expect(maps[0].old.files[0].sizes).toEqual(OLD_BLOCKS.map(b => b.size))
  })
})
