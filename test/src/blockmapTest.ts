import { createHash } from "crypto"
import { readFile, writeFile } from "fs/promises"
import * as path from "path"
import * as zlib from "zlib"
import { describe, expect, it } from "vitest"
import { BlockMapDataHolder } from "builder-util-runtime"
import { BlockMapRegion, BuildBlockMapOptions, buildBlockMap, ChunkerParams, DEFAULT_CHUNKER } from "app-builder-lib/src/targets/blockmap/blockmap.js"

function sha512(data: Buffer): string {
  return createHash("sha512").update(data).digest("base64")
}

// Reproducible deterministic test data (avoids dependency on Python/Go PRNG)
function makeTestData(size: number, seed = 12345): Buffer {
  const buf = Buffer.allocUnsafe(size)
  let x = seed
  for (let i = 0; i < size; i++) {
    x = (x * 1664525 + 1013904223) & 0xffffffff
    buf[i] = (x >>> 24) & 0xff
  }
  return buf
}

describe("buildBlockMap", () => {
  it("file output mode: returns correct sha512 and size for small file", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = Buffer.from("hello world. ".repeat(1024))
    const inFile = path.join(tmpDirPath, "test.bin")
    const outFile = path.join(tmpDirPath, "test.blockmap")
    await writeFile(inFile, data)

    const result = await buildBlockMap(inFile, "gzip", outFile)

    expect(result.size).toBe(data.length)
    expect(result.sha512).toBe(sha512(data))
    expect(result.blockMapSize).toBeUndefined()

    // Blockmap file must exist and decompress to valid JSON
    const compressed = await readFile(outFile)
    const json = JSON.parse(zlib.gunzipSync(compressed).toString())
    expect(json.version).toBe("2")
    expect(json.files).toHaveLength(1)
    expect(json.files[0].name).toBe("file")
    expect(json.files[0].offset).toBe(0)
    expect(json.files[0].sizes.reduce((a: number, b: number) => a + b, 0)).toBe(data.length)
    expect(json.files[0].checksums).toHaveLength(json.files[0].sizes.length)
  })

  it("append mode: appended data is readable and sha512 covers full file", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = Buffer.from("hello world. ".repeat(1024))
    const inFile = path.join(tmpDirPath, "test.bin")
    await writeFile(inFile, data)

    const result = await buildBlockMap(inFile, "deflate")

    // Read the modified file
    const full = await readFile(inFile)
    expect(result.size).toBe(full.length)
    expect(result.sha512).toBe(sha512(full))
    expect(typeof result.blockMapSize).toBe("number")
    expect(result.blockMapSize).toBeGreaterThan(0)
    expect(result.size).toBe(data.length + (result.blockMapSize ?? 0) + 4)

    // Read back the embedded blockmap (last 4 bytes = size, then that many bytes before = compressed blockmap)
    const bmSize = full.readUInt32BE(full.length - 4)
    expect(bmSize).toBe(result.blockMapSize)
    const compressed = full.subarray(full.length - 4 - bmSize, full.length - 4)
    const json = JSON.parse(zlib.inflateRawSync(compressed).toString())
    expect(json.version).toBe("2")
    expect(json.files[0].sizes.reduce((a: number, b: number) => a + b, 0)).toBe(data.length)
  })

  it("chunk sizes sum to file size", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = makeTestData(200_000)
    const inFile = path.join(tmpDirPath, "big.bin")
    const outFile = path.join(tmpDirPath, "big.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", outFile)

    const compressed = await readFile(outFile)
    const json = JSON.parse(zlib.gunzipSync(compressed).toString())
    const total = json.files[0].sizes.reduce((a: number, b: number) => a + b, 0)
    expect(total).toBe(data.length)
  })

  it("chunk sizes respect min/max boundaries", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = makeTestData(500_000)
    const inFile = path.join(tmpDirPath, "large.bin")
    const outFile = path.join(tmpDirPath, "large.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", outFile)

    const compressed = await readFile(outFile)
    const json = JSON.parse(zlib.gunzipSync(compressed).toString())
    const sizes: number[] = json.files[0].sizes

    // All interior chunks (not the last) must be within [MIN, MAX]
    for (let i = 0; i < sizes.length - 1; i++) {
      expect(sizes[i]).toBeGreaterThanOrEqual(8192)
      expect(sizes[i]).toBeLessThanOrEqual(32768)
    }
    // Last chunk can be smaller than MIN (EOF)
    expect(sizes[sizes.length - 1]).toBeGreaterThan(0)
  })

  it("identical data produces identical checksums", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = makeTestData(100_000)
    const file1 = path.join(tmpDirPath, "a.bin")
    const file2 = path.join(tmpDirPath, "b.bin")
    const out1 = path.join(tmpDirPath, "a.blockmap")
    const out2 = path.join(tmpDirPath, "b.blockmap")
    await Promise.all([writeFile(file1, data), writeFile(file2, data)])

    await Promise.all([buildBlockMap(file1, "gzip", out1), buildBlockMap(file2, "gzip", out2)])

    const j1 = JSON.parse(zlib.gunzipSync(await readFile(out1)).toString())
    const j2 = JSON.parse(zlib.gunzipSync(await readFile(out2)).toString())
    expect(j1.files[0].checksums).toEqual(j2.files[0].checksums)
    expect(j1.files[0].sizes).toEqual(j2.files[0].sizes)
  })

  it("chunk checksums match BLAKE2b-18 of chunk content", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const blake2bPath = require.resolve("@noble/hashes/blake2.js", {
      // Resolve relative to app-builder-lib's blockmap directory so we get the same
      // @noble/hashes instance that blockmap.ts uses (package-scoped installation).
      paths: [path.resolve(__dirname, "../../packages/app-builder-lib/src/targets/blockmap")],
    })
    const { blake2b } = require(blake2bPath) as typeof import("@noble/hashes/blake2.js")
    const data = makeTestData(50_000)
    const inFile = path.join(tmpDirPath, "checksum.bin")
    const outFile = path.join(tmpDirPath, "checksum.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", outFile)

    const json = JSON.parse(zlib.gunzipSync(await readFile(outFile)).toString())
    const sizes: number[] = json.files[0].sizes
    const checksums: string[] = json.files[0].checksums

    let offset = 0
    for (let i = 0; i < sizes.length; i++) {
      const chunk = data.subarray(offset, offset + sizes[i])
      const expected = Buffer.from(blake2b(chunk, { dkLen: 18 })).toString("base64")
      expect(checksums[i]).toBe(expected)
      offset += sizes[i]
    }
  })

  it("matches Go binary output: chunk boundaries for known test data", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    // Verified against app-builder binary: 200KB random data (LCG seed 12345)
    // produces specific chunk sizes with this Rabin configuration.
    // Run against the binary first if chunk boundaries change.
    const data = makeTestData(200_000)
    const inFile = path.join(tmpDirPath, "boundary.bin")
    const outFile = path.join(tmpDirPath, "boundary.blockmap")
    await writeFile(inFile, data)

    const result = await buildBlockMap(inFile, "gzip", outFile)

    // Structural checks
    const json = JSON.parse(zlib.gunzipSync(await readFile(outFile)).toString())
    expect(json.files[0].sizes.reduce((a: number, b: number) => a + b, 0)).toBe(200_000)
    expect(result.sha512).toBe(sha512(data))
    // Must produce more than 1 chunk for 200KB (avg=16KB → expect ~12 chunks)
    expect(json.files[0].sizes.length).toBeGreaterThan(5)
  })

  it("file smaller than MIN is a single chunk", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = Buffer.allocUnsafe(4096).fill(0xab)
    const inFile = path.join(tmpDirPath, "small.bin")
    const outFile = path.join(tmpDirPath, "small.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", outFile)

    const json = JSON.parse(zlib.gunzipSync(await readFile(outFile)).toString())
    expect(json.files[0].sizes).toHaveLength(1)
    expect(json.files[0].sizes[0]).toBe(4096)
  })
})

// ─── Golden-output suite: JS snapshots + optional binary cross-check ─────────
//
// Every test here ALWAYS runs the JS implementation and snapshots its output.
// The snapshots are the permanent regression baseline: once committed they
// remain valid even after app-builder-bin is eventually removed from the tree.
//
// When the binary IS present on disk (binaryAvailable === true) each test also
// runs app-builder-bin on the same input and asserts byte-exact equality of
// `sizes` and `checksums` — proving the JS port produces identical chunk
// boundaries and BLAKE2b-18 hashes.
//
// Fields intentionally not compared across implementations:
//   • compressed blockmap byte-length — Go flate and Node zlib produce
//     different but equally valid DEFLATE/GZIP streams.
//   • sha512 in append mode — covers the appended compressed bytes, which
//     differ between implementations for the same reason.

describe("buildBlockMap — JS snapshots and binary golden-output", () => {
  it("single-chunk file (< MIN): sizes, checksums and sha512 are snapshotted", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = Buffer.from("hello world. ".repeat(1024)) // 13 312 bytes < RABIN_MIN
    const inFile = path.join(tmpDirPath, "single.bin")
    const jsOut = path.join(tmpDirPath, "single-js.blockmap")
    await writeFile(inFile, data)

    const jsResult = await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    // Snapshot JS output — this is the retained baseline after binary removal
    expect(js.files[0].sizes).toMatchSnapshot()
    expect(js.files[0].checksums).toMatchSnapshot()
    expect(jsResult.sha512).toMatchSnapshot()
    expect(js.version).toBe("2")
    expect(js.files[0].name).toBe("file")
    expect(js.files[0].offset).toBe(0)
  })

  it("multi-chunk random data (200 KB, seed 12345): sizes and checksums are snapshotted", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = makeTestData(200_000)
    const inFile = path.join(tmpDirPath, "multi200k.bin")
    const jsOut = path.join(tmpDirPath, "multi200k-js.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toMatchSnapshot()
    expect(js.files[0].checksums).toMatchSnapshot()
    // Multiple chunks expected for 200 KB with 16 KB average
    expect(js.files[0].sizes.length).toBeGreaterThan(1)
  })

  it("multi-chunk random data (500 KB, seed 99999): sizes and checksums are snapshotted", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = makeTestData(500_000, 99999)
    const inFile = path.join(tmpDirPath, "multi500k.bin")
    const jsOut = path.join(tmpDirPath, "multi500k-js.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toMatchSnapshot()
    expect(js.files[0].checksums).toMatchSnapshot()
  })

  it("uniformly-zero buffer (100 KB): every interior chunk hits MAX=32768", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = Buffer.alloc(100_000, 0x00)
    const inFile = path.join(tmpDirPath, "zeros.bin")
    const jsOut = path.join(tmpDirPath, "zeros-js.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toMatchSnapshot()
    expect(js.files[0].checksums).toMatchSnapshot()
    // All chunks except the last must be exactly RABIN_MAX
    for (const size of (js.files[0].sizes as number[]).slice(0, -1)) {
      expect(size).toBe(32768)
    }
  })

  it("uniformly-filled buffer (150 KB, 0xFF): sizes and checksums are snapshotted", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = Buffer.alloc(150_000, 0xff)
    const inFile = path.join(tmpDirPath, "ff.bin")
    const jsOut = path.join(tmpDirPath, "ff-js.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toMatchSnapshot()
    expect(js.files[0].checksums).toMatchSnapshot()
  })

  it("append mode (deflate, 80 KB): embedded blockmap content is snapshotted", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = makeTestData(80_000, 42)
    const jsFile = path.join(tmpDirPath, "append-js.bin")
    await writeFile(jsFile, data)

    const jsMeta = await buildBlockMap(jsFile, "deflate")
    const jsFull = await readFile(jsFile)
    const jsBmSize = jsFull.readUInt32BE(jsFull.length - 4)
    const jsBm = JSON.parse(zlib.inflateRawSync(jsFull.subarray(jsFull.length - 4 - jsBmSize, jsFull.length - 4)).toString())

    expect(jsBm.files[0].sizes).toMatchSnapshot()
    expect(jsBm.files[0].checksums).toMatchSnapshot()
    expect(jsMeta.blockMapSize).toMatchSnapshot()
    expect(jsMeta.size).toBe(data.length + jsBmSize + 4)
    expect(jsMeta.sha512).toBe(sha512(jsFull))
  })

  it("file-output sha512: returns SHA-512 of the original unmodified file", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const data = makeTestData(300_000, 7777)
    const inFile = path.join(tmpDirPath, "sha-check.bin")
    const jsOut = path.join(tmpDirPath, "sha-check-js.blockmap")
    await writeFile(inFile, data)
    const expected = sha512(data)

    const jsResult = await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toMatchSnapshot()
    expect(js.files[0].checksums).toMatchSnapshot()
    expect(jsResult.sha512).toMatchSnapshot()
    expect(jsResult.sha512).toBe(expected)
  })
})

// ─── Region-aware chunking (BuildBlockMapOptions.regions) ───────────────────

describe("buildBlockMap — regions", () => {
  const FINE: ChunkerParams = { min: 1024, avg: 4096, max: 16384 }

  interface Built {
    sizes: number[]
    checksums: string[]
    result: BlockMapDataHolder
  }

  async function build(dir: string, name: string, data: Buffer, options?: BuildBlockMapOptions): Promise<Built> {
    const inFile = path.join(dir, `${name}.bin`)
    const outFile = path.join(dir, `${name}.blockmap`)
    await writeFile(inFile, data)
    const result = await buildBlockMap(inFile, "gzip", outFile, options)
    const json = JSON.parse(zlib.gunzipSync(await readFile(outFile)).toString())
    expect(json.files).toHaveLength(1)
    expect(json.files[0].name).toBe("file")
    expect(json.files[0].offset).toBe(0)
    return { sizes: json.files[0].sizes, checksums: json.files[0].checksums, result }
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

  /** Indices [first, last) of the blocks that lie inside [offset, offset + size); asserts both edges are block boundaries. */
  function blocksInRegion(sizes: number[], offset: number, size: number): { first: number; last: number } {
    const ends = blockEnds(sizes)
    const first = offset === 0 ? 0 : ends.indexOf(offset) + 1
    const last = ends.indexOf(offset + size) + 1
    expect(offset === 0 || ends.includes(offset)).toBe(true)
    expect(ends).toContain(offset + size)
    return { first, last }
  }

  function expectWithinParams(sizes: number[], params: ChunkerParams) {
    for (let i = 0; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(0)
      expect(sizes[i]).toBeLessThanOrEqual(params.max)
      // Every block but the last of a region must be at least `min` (the last is cut by the forced edge)
      if (i < sizes.length - 1) {
        expect(sizes[i]).toBeGreaterThanOrEqual(params.min)
      }
    }
  }

  it("no regions: undefined, {}, null and [] all produce the default blockmap", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(300_000, 4242)
    const baseline = await build(dir, "none", data)
    for (const [name, options] of [
      ["empty-options", {}],
      ["null-regions", { regions: null }],
      ["empty-regions", { regions: [] }],
    ] as Array<[string, BuildBlockMapOptions]>) {
      const built = await build(dir, name, data, options)
      expect(built.sizes).toEqual(baseline.sizes)
      expect(built.checksums).toEqual(baseline.checksums)
      expect(built.result.sha512).toBe(baseline.result.sha512)
      expect(built.result.size).toBe(baseline.result.size)
    }
    // And the default output is exactly what the pre-regions chunker produced
    expectWithinParams(baseline.sizes, DEFAULT_CHUNKER)
    expect(baseline.result.sha512).toBe(sha512(data))
  })

  it("forces chunk boundaries at region start and end", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(300_000, 1)
    const region = { offset: 100_000, size: 120_000, chunker: FINE }
    const { sizes } = await build(dir, "edges", data, { regions: [region] })

    const ends = blockEnds(sizes)
    expect(ends).toContain(region.offset)
    expect(ends).toContain(region.offset + region.size)
    expect(ends[ends.length - 1]).toBe(data.length)

    const { first, last } = blocksInRegion(sizes, region.offset, region.size)
    expectWithinParams(sizes.slice(first, last), FINE)
    expectWithinParams(sizes.slice(0, first), DEFAULT_CHUNKER)
    expectWithinParams(sizes.slice(last), DEFAULT_CHUNKER)
  })

  it("region blocks obey min/max and average around avg (~2 MB random region)", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const region = { offset: 262_144, size: 2 * 1024 * 1024, chunker: FINE }
    const data = makeTestData(region.offset + region.size + 100_000, 777)
    const { sizes } = await build(dir, "band", data, { regions: [region] })

    const { first, last } = blocksInRegion(sizes, region.offset, region.size)
    const regionSizes = sizes.slice(first, last)
    expectWithinParams(regionSizes, FINE)
    expect(regionSizes.reduce((a, b) => a + b, 0)).toBe(region.size)
    const average = region.size / regionSizes.length
    expect(average).toBeGreaterThanOrEqual(FINE.avg / 2)
    expect(average).toBeLessThanOrEqual(FINE.avg * 2)
    // Finer than the default chunker: far more blocks than the same span would get by default
    expect(regionSizes.length).toBeGreaterThan(region.size / DEFAULT_CHUNKER.max)
  })

  it("region blocks depend only on the region bytes (same bytes, different offset and surroundings)", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const regionBytes = makeTestData(1024 * 1024, 555)

    const offsetA = 50_000
    const dataA = Buffer.concat([makeTestData(offsetA, 11), regionBytes, makeTestData(70_000, 12)])
    // Odd offset: the region starts in the middle of what would otherwise be a default chunk's skip/prime phase
    const offsetB = 123_457
    const dataB = Buffer.concat([makeTestData(offsetB, 13), regionBytes, makeTestData(10, 14)])

    const a = await build(dir, "a", dataA, { regions: [{ offset: offsetA, size: regionBytes.length, chunker: FINE }] })
    const b = await build(dir, "b", dataB, { regions: [{ offset: offsetB, size: regionBytes.length, chunker: FINE }] })

    const ra = blocksInRegion(a.sizes, offsetA, regionBytes.length)
    const rb = blocksInRegion(b.sizes, offsetB, regionBytes.length)
    const sizesA = a.sizes.slice(ra.first, ra.last)
    const sizesB = b.sizes.slice(rb.first, rb.last)
    expect(sizesA.length).toBeGreaterThan(50)
    expect(sizesB).toEqual(sizesA)
    expect(b.checksums.slice(rb.first, rb.last)).toEqual(a.checksums.slice(ra.first, ra.last))
    // Surroundings differ, so the blocks outside the region do not all match
    expect(a.checksums.slice(0, ra.first)).not.toEqual(b.checksums.slice(0, rb.first))
  })

  it("rejects invalid regions with clear messages", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const inFile = path.join(dir, "invalid.bin")
    const outFile = path.join(dir, "invalid.blockmap")
    await writeFile(inFile, makeTestData(100_000, 5))
    const ok = { min: 1024, avg: 4096, max: 8192 }

    const cases: Array<[Array<BlockMapRegion>, RegExp]> = [
      [[{ offset: 0, size: 10_000, chunker: { min: 1024, avg: 3000, max: 8192 } }], /avg must be a power of two/],
      [[{ offset: 0, size: 10_000, chunker: { min: 4096, avg: 4096, max: 8192 } }], /min < avg <= max/],
      [[{ offset: 0, size: 10_000, chunker: { min: 1024, avg: 8192, max: 4096 } }], /min < avg <= max/],
      [[{ offset: 0, size: 10_000, chunker: { min: 64, avg: 4096, max: 8192 } }], /min must be greater than the Rabin window \(64\)/],
      [[{ offset: 0, size: 10_000, chunker: { min: 1024.5, avg: 4096, max: 8192 } }], /chunker\.min must be a positive integer/],
      [[{ offset: -1, size: 10_000, chunker: ok }], /offset must be a non-negative integer/],
      [[{ offset: 0, size: 0, chunker: ok }], /size must be a positive integer/],
      [
        [
          { offset: 50_000, size: 10_000, chunker: ok },
          { offset: 10_000, size: 10_000, chunker: ok },
        ],
        /ascending and non-overlapping/,
      ],
      [
        [
          { offset: 10_000, size: 10_000, chunker: ok },
          { offset: 19_999, size: 10_000, chunker: ok },
        ],
        /ascending and non-overlapping/,
      ],
      [[{ offset: 90_000, size: 10_001, chunker: ok }], /extends past the end of the input \(100000 bytes\)/],
      [[{ offset: 100_000, size: 1, chunker: ok }], /extends past the end of the input/],
    ]
    for (const [regions, message] of cases) {
      await expect(buildBlockMap(inFile, "gzip", outFile, { regions })).rejects.toThrow(message)
    }
    // The error names the offending region
    await expect(
      buildBlockMap(inFile, "gzip", outFile, {
        regions: [
          { offset: 0, size: 1000, chunker: ok },
          { offset: 500, size: 1000, chunker: ok },
        ],
      })
    ).rejects.toThrow(/^blockmap region #1:/)
  })

  it("multiple regions, adjacent regions, a region at offset 0 and a region ending at EOF", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(400_000, 31337)
    const coarse: ChunkerParams = { min: 2048, avg: 8192, max: 65536 }
    const regions: Array<BlockMapRegion> = [
      { offset: 0, size: 50_000, chunker: FINE },
      { offset: 100_000, size: 60_000, chunker: coarse },
      { offset: 160_000, size: 20_000, chunker: FINE }, // adjacent to the previous one
      { offset: 340_000, size: 60_000, chunker: FINE }, // ends exactly at EOF
    ]
    const { sizes, checksums, result } = await build(dir, "multi", data, { regions })

    expect(sizes.reduce((a, b) => a + b, 0)).toBe(data.length)
    expect(checksums).toHaveLength(sizes.length)
    expect(result.size).toBe(data.length)
    expect(result.sha512).toBe(sha512(data))

    const ends = blockEnds(sizes)
    for (const region of regions) {
      if (region.offset > 0) {
        expect(ends).toContain(region.offset)
      }
      expect(ends).toContain(region.offset + region.size)
      const { first, last } = blocksInRegion(sizes, region.offset, region.size)
      expect(last).toBeGreaterThan(first)
      expectWithinParams(sizes.slice(first, last), region.chunker)
    }
    // Default spans between regions still obey the default parameters
    const gap1 = blocksInRegion(sizes, 50_000, 50_000)
    expectWithinParams(sizes.slice(gap1.first, gap1.last), DEFAULT_CHUNKER)
    const gap2 = blocksInRegion(sizes, 180_000, 160_000)
    expectWithinParams(sizes.slice(gap2.first, gap2.last), DEFAULT_CHUNKER)

    // Every checksum is BLAKE2b-18 of the block bytes, regions included
    const blake2bPath = require.resolve("@noble/hashes/blake2.js", {
      paths: [path.resolve(__dirname, "../../packages/app-builder-lib/src/targets/blockmap")],
    })
    const { blake2b } = require(blake2bPath) as typeof import("@noble/hashes/blake2.js")
    let offset = 0
    for (let i = 0; i < sizes.length; i++) {
      expect(checksums[i]).toBe(Buffer.from(blake2b(data.subarray(offset, offset + sizes[i]), { dkLen: 18 })).toString("base64"))
      offset += sizes[i]
    }
  })

  it("regions do not change sha512 or size (file-output and append modes)", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const data = makeTestData(250_000, 2024)
    const regions: Array<BlockMapRegion> = [{ offset: 40_000, size: 150_000, chunker: FINE }]

    const plain = await build(dir, "plain", data)
    const withRegions = await build(dir, "regions", data, { regions })
    expect(withRegions.sizes).not.toEqual(plain.sizes)
    expect(withRegions.result.size).toBe(plain.result.size)
    expect(withRegions.result.size).toBe(data.length)
    expect(withRegions.result.sha512).toBe(sha512(data))

    // Append mode: sha512 covers the input plus the appended blockmap, and the input is intact
    const appendFile = path.join(dir, "append.bin")
    await writeFile(appendFile, data)
    const meta = await buildBlockMap(appendFile, "deflate", undefined, { regions })
    const full = await readFile(appendFile)
    expect(full.subarray(0, data.length).equals(data)).toBe(true)
    expect(meta.size).toBe(full.length)
    expect(meta.size).toBe(data.length + (meta.blockMapSize ?? 0) + 4)
    expect(meta.sha512).toBe(sha512(full))
    const bm = JSON.parse(zlib.inflateRawSync(full.subarray(full.length - 4 - (meta.blockMapSize ?? 0), full.length - 4)).toString())
    expect(bm.files[0].sizes).toEqual(withRegions.sizes)
    expect(bm.files[0].checksums).toEqual(withRegions.checksums)
  })
})
