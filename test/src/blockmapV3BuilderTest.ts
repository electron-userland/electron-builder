import { createHash } from "crypto"
import { readFileSync as readFileSyncAsBuffer } from "fs"
import { readFile, writeFile } from "fs/promises"
import { load as yamlLoad } from "js-yaml"
import * as path from "path"
import * as zlib from "zlib"
import { describe, expect, it, vi } from "vitest"
import { Platform } from "app-builder-lib"
import { createUpdateInfoTasks, writeUpdateInfoFiles } from "app-builder-lib/internal"
import { BlockMapRegion, buildBlockMap, ChunkerParams, chunkFile, DEFAULT_CHUNKER } from "app-builder-lib/src/targets/blockmap/blockmap.js"
import { buildBlockMapV3 } from "app-builder-lib/src/targets/blockmap/blockmapV3.js"
import { BLOCK_MAP_FILE_SUFFIX, createBlockmap, STORED_MEMBER_CHUNKER, STORED_MEMBER_CHUNKER_V3, toV3Regions } from "app-builder-lib/src/targets/differentialUpdateInfoBuilder.js"
import { Arch } from "builder-util"
import { BLOCK_MAP_V3_FILE_SUFFIX, BlockMapV3, BlockMapV3Group, decodeBlockMapV3, GenericServerOptions, GROUP_MAX, GROUP_MIN, HASH_LEN } from "builder-util-runtime"

// Reproducible deterministic test data (same LCG as blockmapTest.ts)
function makeTestData(size: number, seed = 12345): Buffer {
  const buf = Buffer.allocUnsafe(size)
  let x = seed
  for (let i = 0; i < size; i++) {
    x = (x * 1664525 + 1013904223) & 0xffffffff
    buf[i] = (x >>> 24) & 0xff
  }
  return buf
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex")
}

function loadBlake2b() {
  const blake2bPath = require.resolve("@noble/hashes/blake2.js", {
    // the same @noble/hashes instance blockmap.ts uses (package-scoped installation)
    paths: [path.resolve(__dirname, "../../packages/app-builder-lib/src/targets/blockmap")],
  })
  return (require(blake2bPath) as typeof import("@noble/hashes/blake2.js")).blake2b
}

async function buildV3(dir: string, name: string, data: Buffer, regions?: Array<BlockMapRegion>) {
  const inFile = path.join(dir, `${name}.bin`)
  const outFile = path.join(dir, `${name}${BLOCK_MAP_V3_FILE_SUFFIX}`)
  await writeFile(inFile, data)
  const result = await buildBlockMapV3(inFile, outFile, { regions })
  const bytes = await readFile(outFile)
  return { inFile, outFile, result, bytes, map: decodeBlockMapV3(bytes) }
}

/** Cumulative end offsets of every block: block i covers [ends[i] - sizes[i], ends[i]). */
function blockEnds(sizes: number[]): number[] {
  const ends: number[] = []
  let sum = 0
  for (const size of sizes) {
    sum += size
    ends.push(sum)
  }
  return ends
}

/** Block indices [first, last) that cover exactly [offset, offset + size) — both edges must be block boundaries. */
function blocksInRange(sizes: number[], offset: number, size: number): { first: number; last: number } {
  const ends = blockEnds(sizes)
  expect(offset === 0 || ends.includes(offset)).toBe(true)
  expect(ends).toContain(offset + size)
  return { first: offset === 0 ? 0 : ends.indexOf(offset) + 1, last: ends.indexOf(offset + size) + 1 }
}

/** Groups that cover exactly [offset, offset + size) — both edges must be group boundaries. */
function groupsInRange(map: BlockMapV3, offset: number, size: number): Array<BlockMapV3Group> {
  const ends = blockEnds(map.groups.map(g => g.byteLength))
  expect(offset === 0 || ends.includes(offset)).toBe(true)
  expect(ends).toContain(offset + size)
  const first = offset === 0 ? 0 : ends.indexOf(offset) + 1
  const last = ends.indexOf(offset + size) + 1
  return map.groups.slice(first, last)
}

function expectWithinParams(sizes: number[], params: ChunkerParams) {
  for (let i = 0; i < sizes.length; i++) {
    expect(sizes[i]).toBeGreaterThan(0)
    expect(sizes[i]).toBeLessThanOrEqual(params.max)
    // every block but the last of a span must be at least `min` (the last is cut by the forced edge / EOF)
    if (i < sizes.length - 1) {
      expect(sizes[i]).toBeGreaterThanOrEqual(params.min)
    }
  }
}

describe("buildBlockMapV3", () => {
  it("writes a v3 map whose header, records and group table describe the input", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(700_000, 31)
    const region: BlockMapRegion = { offset: 200_000, size: 300_000, chunker: STORED_MEMBER_CHUNKER_V3 }
    const { result, bytes, map } = await buildV3(dir, "basic", data, [region])

    expect(result.size).toBe(data.length)
    expect(result.blockCount).toBe(map.records.length)
    expect(result.groupCount).toBe(map.groups.length)
    expect(map.header.fileSize).toBe(data.length)
    expect(map.header.blockCount).toBe(result.blockCount)
    expect(map.header.groupCount).toBe(result.groupCount)
    expect(map.header.defaultChunker).toEqual(DEFAULT_CHUNKER)
    expect(map.header.regions).toEqual([{ offset: region.offset, size: region.size, ...STORED_MEMBER_CHUNKER_V3 }])
    // about 10 B per block on the wire
    expect(bytes.length).toBeLessThan(map.records.length * 10 + map.groups.length * 16 + map.supers.length * 16 + 128)

    const sizes = map.records.map(r => r.size)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(data.length)
    expect(map.groups.reduce((a, g) => a + g.byteLength, 0)).toBe(data.length)
    expect(map.groups.reduce((a, g) => a + g.blockCount, 0)).toBe(map.records.length)

    // every record hash is the first 8 bytes of blake2b-18 over the block bytes
    const blake2b = loadBlake2b()
    let offset = 0
    for (const record of map.records) {
      const digest = blake2b(data.subarray(offset, offset + record.size), { dkLen: 18 })
      expect(record.hash).toBe(Buffer.from(digest.subarray(0, HASH_LEN)).toString("hex"))
      offset += record.size
    }
  })

  it("chunks with the region's parameters inside a region and the default outside, with forced boundaries at both edges", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const region: BlockMapRegion = { offset: 150_001, size: 1_000_000, chunker: STORED_MEMBER_CHUNKER_V3 }
    const data = makeTestData(region.offset + region.size + 120_000, 99)
    const { map } = await buildV3(dir, "edges", data, [region])
    const sizes = map.records.map(r => r.size)

    // cumulative block sizes hit both region edges, and EOF
    const ends = blockEnds(sizes)
    expect(ends).toContain(region.offset)
    expect(ends).toContain(region.offset + region.size)
    expect(ends[ends.length - 1]).toBe(data.length)

    const { first, last } = blocksInRange(sizes, region.offset, region.size)
    const inside = sizes.slice(first, last)
    expectWithinParams(inside, STORED_MEMBER_CHUNKER_V3)
    expectWithinParams(sizes.slice(0, first), DEFAULT_CHUNKER)
    expectWithinParams(sizes.slice(last), DEFAULT_CHUNKER)
    // finer than the default: averages around the region's avg
    const average = region.size / inside.length
    expect(average).toBeGreaterThanOrEqual(STORED_MEMBER_CHUNKER_V3.avg / 2)
    expect(average).toBeLessThanOrEqual(STORED_MEMBER_CHUNKER_V3.avg * 2)
    // the default spans use the default chunker: far fewer blocks per byte
    expect(sizes.slice(0, first).length).toBeLessThan(region.offset / DEFAULT_CHUNKER.min + 1)

    // group boundaries are forced at both region edges too
    const groupEnds = blockEnds(map.groups.map(g => g.byteLength))
    expect(groupEnds).toContain(region.offset)
    expect(groupEnds).toContain(region.offset + region.size)
    // and groups are bounded (the last group of every span may be short)
    const insideGroups = groupsInRange(map, region.offset, region.size)
    expect(insideGroups.length).toBeGreaterThan(1)
    for (const group of insideGroups.slice(0, -1)) {
      expect(group.blockCount).toBeGreaterThanOrEqual(GROUP_MIN)
      expect(group.blockCount).toBeLessThanOrEqual(GROUP_MAX)
    }
  })

  it("no regions: the v3 blocks are exactly the v2 blocks (same chunker, same digests)", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(400_000, 1234)
    const { inFile, map } = await buildV3(dir, "same", data)
    expect(map.header.regions).toEqual([])

    const v2Out = path.join(dir, `same${BLOCK_MAP_FILE_SUFFIX}`)
    await buildBlockMap(inFile, "gzip", v2Out)
    const v2 = JSON.parse(zlib.gunzipSync(await readFile(v2Out)).toString())
    expect(map.records.map(r => r.size)).toEqual(v2.files[0].sizes)
    // v2 base64-encodes the whole 18-byte digest; v3 keeps its first 8 bytes
    expect(map.records.map(r => r.hash)).toEqual(v2.files[0].checksums.map((c: string) => Buffer.from(c, "base64").subarray(0, HASH_LEN).toString("hex")))
  })

  it("is deterministic: two builds of the same input are byte-identical", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(500_000, 77)
    const regions: Array<BlockMapRegion> = [{ offset: 64_000, size: 300_000, chunker: STORED_MEMBER_CHUNKER_V3 }]
    const a = await buildV3(dir, "det-a", data, regions)
    const b = await buildV3(dir, "det-b", data, regions)
    expect(a.bytes.equals(b.bytes)).toBe(true)
    expect(a.result).toEqual(b.result)
  })

  it("an unchanged region yields identical groups (hash, byteLength, blockCount) when preceded by different bytes", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const regionBytes = makeTestData(1024 * 1024, 555)
    const suffix = makeTestData(90_000, 12)

    const offsetA = 50_000
    const dataA = Buffer.concat([makeTestData(offsetA, 11), regionBytes, suffix])
    // different length AND content before the region, so every absolute offset differs
    const offsetB = 123_457
    const dataB = Buffer.concat([makeTestData(offsetB, 13), regionBytes, suffix])

    const a = await buildV3(dir, "layout-a", dataA, [{ offset: offsetA, size: regionBytes.length, chunker: STORED_MEMBER_CHUNKER_V3 }])
    const b = await buildV3(dir, "layout-b", dataB, [{ offset: offsetB, size: regionBytes.length, chunker: STORED_MEMBER_CHUNKER_V3 }])

    const groupsA = groupsInRange(a.map, offsetA, regionBytes.length)
    const groupsB = groupsInRange(b.map, offsetB, regionBytes.length)
    expect(groupsA.length).toBeGreaterThan(3)
    expect(groupsB).toEqual(groupsA)
    // the bytes after the region start at a forced boundary too, so their groups match as well
    expect(groupsInRange(b.map, offsetB + regionBytes.length, suffix.length)).toEqual(groupsInRange(a.map, offsetA + regionBytes.length, suffix.length))
    // while the differing prefixes do not
    expect(groupsInRange(b.map, 0, offsetB).map(g => g.hash)).not.toEqual(groupsInRange(a.map, 0, offsetA).map(g => g.hash))
  })

  it("rejects a region whose blocks could not fit a 16-bit record size", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const inFile = path.join(dir, "big.bin")
    await writeFile(inFile, makeTestData(100_000, 5))
    await expect(
      buildBlockMapV3(inFile, path.join(dir, "big.blockmap3"), { regions: [{ offset: 0, size: 50_000, chunker: { min: 4096, avg: 65536, max: 131072 } }] })
    ).rejects.toThrow(/blockmap region #0: chunker\.max must not exceed 65535/)
  })
})

describe("chunkFile (shared v2/v3 chunker loop)", () => {
  // Reference digests produced by the pre-refactor buildBlockMap (blockmap.ts at 7229da5) on the same
  // inputs; the refactor moved the per-byte loop into chunkFile and must not change a single block.
  const REFERENCE = {
    input: { size: 600_000, seed: 2026 },
    sha512: "nbw6fkdxrXdnN4M/G70TuGOrhpUKSSuL6ExmmIV7TMUUoqFEBRakOJ7tV4pve5+leuKFMtcyAMtmN63C7CMDIg==",
    plain: { jsonSha256: "c38f42b22c99cdc9952ddd76465dba6d30eead1e474eb9bef3d59ac3da27e384", blocks: 29 },
    regions: { jsonSha256: "2baac3c33dfe5bd26e74bc6454f8f0aad5b2966a5cbc49c5bc078e5d3d75db76", blocks: 41 },
    append: { blockMapSize: 1061, sha512: "eXgaJA4VvpHCOWV7Q+nAKHj/n56bGg0dCNhSMfQT35MDKTm7kzQ4fQ1mF3Q31rDPV9N5G1ilpuoNFFPhc6lQdA==" },
  }
  const REFERENCE_REGIONS: Array<BlockMapRegion> = [{ offset: 100_000, size: 250_000, chunker: STORED_MEMBER_CHUNKER }]

  it("v2 output is byte-for-byte what the pre-refactor chunker produced (file-output and append modes)", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(REFERENCE.input.size, REFERENCE.input.seed)
    const inFile = path.join(dir, "ref.bin")
    await writeFile(inFile, data)

    for (const [name, options, expected] of [
      ["plain", undefined, REFERENCE.plain],
      ["regions", { regions: REFERENCE_REGIONS }, REFERENCE.regions],
    ] as const) {
      const outFile = path.join(dir, `${name}${BLOCK_MAP_FILE_SUFFIX}`)
      const result = await buildBlockMap(inFile, "gzip", outFile, options)
      const json = zlib.gunzipSync(await readFile(outFile))
      expect(sha256(json)).toBe(expected.jsonSha256)
      expect(JSON.parse(json.toString()).files[0].sizes).toHaveLength(expected.blocks)
      expect(result.sha512).toBe(REFERENCE.sha512)
      expect(result.size).toBe(data.length)
    }

    const appendFile = path.join(dir, "append.bin")
    await writeFile(appendFile, data)
    const meta = await buildBlockMap(appendFile, "deflate", undefined, { regions: REFERENCE_REGIONS })
    expect(meta.blockMapSize).toBe(REFERENCE.append.blockMapSize)
    expect(meta.sha512).toBe(REFERENCE.append.sha512)
    expect(meta.size).toBe(data.length + REFERENCE.append.blockMapSize + 4)
  })

  it("yields exactly the blocks the v2 map records, with offsets and the raw read stream", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(450_000, 8)
    const inFile = path.join(dir, "chunks.bin")
    await writeFile(inFile, data)
    const options = { regions: [{ offset: 30_000, size: 200_000, chunker: STORED_MEMBER_CHUNKER }] }

    const blake2b = loadBlake2b()
    const seen: Array<{ offset: number; size: number; checksum: string }> = []
    const raw: Buffer[] = []
    const total = await chunkFile(
      inFile,
      options,
      (chunk, offset) => {
        // `chunk` is only valid during the call — verify it against the input right here
        expect(chunk.equals(data.subarray(offset, offset + chunk.length))).toBe(true)
        seen.push({ offset, size: chunk.length, checksum: Buffer.from(blake2b(chunk, { dkLen: 18 })).toString("base64") })
      },
      buf => raw.push(Buffer.from(buf))
    )
    expect(total).toBe(data.length)
    expect(Buffer.concat(raw).equals(data)).toBe(true)
    // offsets are the cumulative sizes
    let expectedOffset = 0
    for (const block of seen) {
      expect(block.offset).toBe(expectedOffset)
      expectedOffset += block.size
    }
    expect(expectedOffset).toBe(data.length)

    const outFile = path.join(dir, `chunks${BLOCK_MAP_FILE_SUFFIX}`)
    await buildBlockMap(inFile, "gzip", outFile, options)
    const v2 = JSON.parse(zlib.gunzipSync(await readFile(outFile)).toString())
    expect(seen.map(b => b.size)).toEqual(v2.files[0].sizes)
    expect(seen.map(b => b.checksum)).toEqual(v2.files[0].checksums)
  })
})

describe("createBlockmap — v3 emission", () => {
  it("toV3Regions swaps the stored-member chunker and keeps everything else", ({ expect }) => {
    const custom: ChunkerParams = { min: 2048, avg: 4096, max: 8192 }
    const regions: Array<BlockMapRegion> = [
      { offset: 10, size: 100, chunker: STORED_MEMBER_CHUNKER },
      { offset: 500, size: 100, chunker: { ...STORED_MEMBER_CHUNKER } },
      { offset: 900, size: 100, chunker: custom },
    ]
    expect(toV3Regions(regions)).toEqual([
      { offset: 10, size: 100, chunker: STORED_MEMBER_CHUNKER_V3 },
      { offset: 500, size: 100, chunker: STORED_MEMBER_CHUNKER_V3 },
      { offset: 900, size: 100, chunker: custom },
    ])
    expect(toV3Regions(null)).toEqual([])
    expect(toV3Regions(undefined)).toEqual([])
    // the v2 regions are not mutated
    expect(regions[0].chunker).toBe(STORED_MEMBER_CHUNKER)
    expect(STORED_MEMBER_CHUNKER_V3.max).toBeLessThanOrEqual(0xffff)
  })

  it("emits the .blockmap3 as a second artifact (no updateInfo) and flags the returned holder with blockMapV3", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(600_000, 4321)
    const file = path.join(dir, "App Setup 1.0.0.exe")
    await writeFile(file, data)
    const regions: Array<BlockMapRegion> = [{ offset: 120_000, size: 300_000, chunker: STORED_MEMBER_CHUNKER }]

    const packager = { emitArtifactBuildCompleted: vi.fn().mockResolvedValue(undefined) }
    const target = { name: "nsis" }
    const updateInfo = await createBlockmap(file, target as any, packager as any, "App-Setup-1.0.0.exe", null, { regions })

    expect(updateInfo.blockMapV3).toBe(true)
    expect(updateInfo.size).toBe(data.length)
    expect(updateInfo.sha512).toBe(createHash("sha512").update(data).digest("base64"))
    expect(updateInfo.blockMapSize).toBeUndefined()

    expect(packager.emitArtifactBuildCompleted).toHaveBeenCalledTimes(2)
    const [v2Event] = packager.emitArtifactBuildCompleted.mock.calls[0]
    const [v3Event] = packager.emitArtifactBuildCompleted.mock.calls[1]
    expect(v2Event).toEqual({ file: `${file}${BLOCK_MAP_FILE_SUFFIX}`, safeArtifactName: `App-Setup-1.0.0.exe${BLOCK_MAP_FILE_SUFFIX}`, target, arch: null, packager, updateInfo })
    expect(v3Event).toEqual({ file: `${file}${BLOCK_MAP_V3_FILE_SUFFIX}`, safeArtifactName: `App-Setup-1.0.0.exe${BLOCK_MAP_V3_FILE_SUFFIX}`, target, arch: null, packager })
    expect(v3Event).not.toHaveProperty("updateInfo")
    expect(v3Event).not.toHaveProperty("isWriteUpdateInfo")

    // the v2 map is the unchanged v2 build (STORED_MEMBER_CHUNKER inside the region)
    const v2 = JSON.parse(zlib.gunzipSync(await readFile(v2Event.file)).toString())
    const v2Region = blocksInRange(v2.files[0].sizes, regions[0].offset, regions[0].size)
    expectWithinParams(v2.files[0].sizes.slice(v2Region.first, v2Region.last), STORED_MEMBER_CHUNKER)

    // the v3 map covers the same file with the same region at the finer v3 chunker
    const v3 = decodeBlockMapV3(await readFile(v3Event.file))
    expect(v3.header.fileSize).toBe(data.length)
    expect(v3.header.regions).toEqual([{ offset: regions[0].offset, size: regions[0].size, ...STORED_MEMBER_CHUNKER_V3 }])
    const v3Sizes = v3.records.map(r => r.size)
    const v3Region = blocksInRange(v3Sizes, regions[0].offset, regions[0].size)
    expectWithinParams(v3Sizes.slice(v3Region.first, v3Region.last), STORED_MEMBER_CHUNKER_V3)
    expect(v3Region.last - v3Region.first).toBeGreaterThan(v2Region.last - v2Region.first)
    // outside the region both maps are chunked identically
    expect(v3Sizes.slice(0, v3Region.first)).toEqual(v2.files[0].sizes.slice(0, v2Region.first))
    expect(v3Sizes.slice(v3Region.last)).toEqual(v2.files[0].sizes.slice(v2Region.last))
  })

  it("passes a null safeArtifactName through and builds v3 without regions", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const file = path.join(dir, "App-1.0.0-mac.zip")
    await writeFile(file, makeTestData(100_000, 9))
    const packager = { emitArtifactBuildCompleted: vi.fn().mockResolvedValue(undefined) }
    const updateInfo = await createBlockmap(file, {} as any, packager as any, null)
    expect(updateInfo.blockMapV3).toBe(true)
    expect(packager.emitArtifactBuildCompleted.mock.calls.map(([event]) => [path.basename(event.file), event.safeArtifactName])).toEqual([
      [`App-1.0.0-mac.zip${BLOCK_MAP_FILE_SUFFIX}`, null],
      [`App-1.0.0-mac.zip${BLOCK_MAP_V3_FILE_SUFFIX}`, null],
    ])
    expect(decodeBlockMapV3(await readFile(`${file}${BLOCK_MAP_V3_FILE_SUFFIX}`)).header.regions).toEqual([])
  })

  it("blockMapV3 reaches the files[] entry of latest.yml through the main artifact's updateInfo", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const file = path.join(dir, "App Setup 1.2.3.exe")
    await writeFile(file, makeTestData(50_000, 3))
    const blockMapPackager = { emitArtifactBuildCompleted: vi.fn().mockResolvedValue(undefined) }
    const updateInfo = await createBlockmap(file, {} as any, blockMapPackager as any, null)

    // the minimal PlatformPackager surface createUpdateInfoTasks touches
    const packager = {
      platform: Platform.WINDOWS,
      appInfo: { version: "1.2.3" },
      platformOptions: {},
      config: {},
      getResource: vi.fn().mockResolvedValue(null),
      requireUpdateSigningKeys: vi.fn().mockResolvedValue([]),
    }
    const tasks = await createUpdateInfoTasks(
      { file, target: { outDir: dir } as any, packager: packager as any, arch: Arch.x64, updateInfo, isWriteUpdateInfo: true, safeArtifactName: "App-Setup-1.2.3.exe" },
      [{ provider: "generic", url: "https://example.com/updates" } as GenericServerOptions]
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].info.files).toEqual([{ url: "App Setup 1.2.3.exe", sha512: updateInfo.sha512, size: 50_000, blockMapV3: true }])

    await writeUpdateInfoFiles(tasks, { emitArtifactCreated: vi.fn().mockResolvedValue(undefined) } as any)
    const yml: any = yamlLoad(await readFile(path.join(dir, "latest.yml"), "utf-8"))
    expect(yml.files[0]).toEqual({ url: "App Setup 1.2.3.exe", sha512: updateInfo.sha512, size: 50_000, blockMapV3: true })
    expect(yml.path).toBeUndefined()
  })
})

describe("buildBlockMapV3 — boundaries", () => {
  it("cuts blocks at every boundary without inflating the group table", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(400_000, 11)
    const plain = await buildV3(dir, "plain", data)
    // a forced cut every 400 bytes: 1,000 boundaries, far more than the ~16–256 blocks a group holds
    const boundaries: Array<number> = []
    for (let offset = 400; offset < data.length; offset += 400) {
      boundaries.push(offset)
    }
    const inFile = path.join(dir, "bounded.bin")
    const outFile = path.join(dir, `bounded${BLOCK_MAP_V3_FILE_SUFFIX}`)
    await writeFile(inFile, data)
    const result = await buildBlockMapV3(inFile, outFile, { boundaries })
    const map = decodeBlockMapV3(await readFile(outFile))

    const starts = new Set<number>()
    let offset = 0
    for (const record of map.records) {
      starts.add(offset)
      offset += record.size
    }
    expect(offset).toBe(data.length)
    for (const boundary of boundaries) {
      expect(starts.has(boundary), `block starts at ${boundary}`).toBe(true)
    }
    expect(result.blockCount).toBeGreaterThanOrEqual(boundaries.length)
    // groups are still closed content-defined on the hash stream, not at the boundaries
    expect(result.groupCount).toBeLessThan(boundaries.length / 4)
    expect(result.groupCount).toBeGreaterThanOrEqual(Math.ceil(result.blockCount / GROUP_MAX))
    expect(map.header.regions).toEqual(plain.map.header.regions)
  })
})

describe("createBlockmap — v3Boundaries", () => {
  it("applies the boundaries to the .blockmap3 only; the v2 .blockmap is byte-identical without them", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(300_000, 12)
    const packager = { emitArtifactBuildCompleted: vi.fn().mockResolvedValue(undefined) }
    const target = { name: "nsis" }
    const regions: Array<BlockMapRegion> = [{ offset: 50_000, size: 200_000, chunker: STORED_MEMBER_CHUNKER }]
    const v3Boundaries = [60_000, 90_000, 150_000, 249_999]

    const plainFile = path.join(dir, "plain.exe")
    await writeFile(plainFile, data)
    await createBlockmap(plainFile, target as any, packager as any, null, null, { regions })
    const boundedFile = path.join(dir, "bounded.exe")
    await writeFile(boundedFile, data)
    await createBlockmap(boundedFile, target as any, packager as any, null, null, { regions, v3Boundaries })

    const v2 = (file: string) => zlib.gunzipSync(readFileSyncAsBuffer(`${file}${BLOCK_MAP_FILE_SUFFIX}`)).toString()
    expect(v2(boundedFile)).toBe(v2(plainFile))

    const bounded = decodeBlockMapV3(await readFile(`${boundedFile}${BLOCK_MAP_V3_FILE_SUFFIX}`))
    const plain = decodeBlockMapV3(await readFile(`${plainFile}${BLOCK_MAP_V3_FILE_SUFFIX}`))
    const startsOf = (map: BlockMapV3) => {
      const starts = new Set<number>()
      let offset = 0
      for (const record of map.records) {
        starts.add(offset)
        offset += record.size
      }
      return starts
    }
    const boundedStarts = startsOf(bounded)
    const plainStarts = startsOf(plain)
    for (const boundary of v3Boundaries) {
      expect(boundedStarts.has(boundary), `v3 block starts at ${boundary}`).toBe(true)
    }
    expect(v3Boundaries.some(it => plainStarts.has(it))).toBe(false)
    expect(bounded.header.regions).toEqual(plain.header.regions)
  })
})
