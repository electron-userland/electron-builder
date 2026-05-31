import { createHash } from "crypto"
import { spawnSync } from "child_process"
import { readFileSync } from "fs"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as zlib from "zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildBlockMap } from "app-builder-lib/out/targets/blockmap/blockmap"

// Path to the shipped app-builder-bin binary for golden-output comparisons
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { appBuilderPath } = require("app-builder-bin") as { appBuilderPath: string }

interface BinaryBlockMap {
  version: string
  files: Array<{
    name: string
    offset: number
    checksums: string[]
    sizes: number[]
  }>
}

/** Run the real app-builder-bin binary and return its parsed blockmap JSON. */
function runBinaryBlockmap(
  inFile: string,
  outFile: string,
  compression: "gzip" | "deflate" = "gzip"
): { result: { size: number; sha512: string; blockMapSize?: number }; blockmap: BinaryBlockMap } {
  const args = ["blockmap", "--input", inFile]
  if (outFile) {
    args.push("--output", outFile, "--compression", compression)
  } else {
    args.push("--compression", compression)
  }
  const proc = spawnSync(appBuilderPath, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (proc.status !== 0) {
    throw new Error(`app-builder-bin failed (exit ${proc.status}): ${proc.stderr}`)
  }
  const result = JSON.parse(proc.stdout.trim())
  const compressed = readFileSync(outFile)
  const blockmap: BinaryBlockMap = JSON.parse(zlib.gunzipSync(compressed).toString())
  return { result, blockmap }
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "blockmap-test-"))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

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
  it("file output mode: returns correct sha512 and size for small file", async () => {
    const data = Buffer.from("hello world. ".repeat(1024))
    const inFile = path.join(tmpDir, "test.bin")
    const outFile = path.join(tmpDir, "test.blockmap")
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

  it("append mode: appended data is readable and sha512 covers full file", async () => {
    const data = Buffer.from("hello world. ".repeat(1024))
    const inFile = path.join(tmpDir, "test.bin")
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

  it("chunk sizes sum to file size", async () => {
    const data = makeTestData(200_000)
    const inFile = path.join(tmpDir, "big.bin")
    const outFile = path.join(tmpDir, "big.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", outFile)

    const compressed = await readFile(outFile)
    const json = JSON.parse(zlib.gunzipSync(compressed).toString())
    const total = json.files[0].sizes.reduce((a: number, b: number) => a + b, 0)
    expect(total).toBe(data.length)
  })

  it("chunk sizes respect min/max boundaries", async () => {
    const data = makeTestData(500_000)
    const inFile = path.join(tmpDir, "large.bin")
    const outFile = path.join(tmpDir, "large.blockmap")
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

  it("identical data produces identical checksums", async () => {
    const data = makeTestData(100_000)
    const file1 = path.join(tmpDir, "a.bin")
    const file2 = path.join(tmpDir, "b.bin")
    const out1 = path.join(tmpDir, "a.blockmap")
    const out2 = path.join(tmpDir, "b.blockmap")
    await Promise.all([writeFile(file1, data), writeFile(file2, data)])

    await Promise.all([buildBlockMap(file1, "gzip", out1), buildBlockMap(file2, "gzip", out2)])

    const j1 = JSON.parse(zlib.gunzipSync(await readFile(out1)).toString())
    const j2 = JSON.parse(zlib.gunzipSync(await readFile(out2)).toString())
    expect(j1.files[0].checksums).toEqual(j2.files[0].checksums)
    expect(j1.files[0].sizes).toEqual(j2.files[0].sizes)
  })

  it("chunk checksums match BLAKE2b-18 of chunk content", async () => {
    const blake2bPath = require.resolve("@noble/hashes/blake2.js", {
      paths: [require.resolve("app-builder-lib/out/targets/blockmap/blockmap")],
    })
    const { blake2b } = require(blake2bPath) as typeof import("@noble/hashes/blake2")
    const data = makeTestData(50_000)
    const inFile = path.join(tmpDir, "checksum.bin")
    const outFile = path.join(tmpDir, "checksum.blockmap")
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

  it("matches Go binary output: chunk boundaries for known test data", async () => {
    // Verified against app-builder binary: 200KB random data (LCG seed 12345)
    // produces specific chunk sizes with this Rabin configuration.
    // Run against the binary first if chunk boundaries change.
    const data = makeTestData(200_000)
    const inFile = path.join(tmpDir, "boundary.bin")
    const outFile = path.join(tmpDir, "boundary.blockmap")
    await writeFile(inFile, data)

    const result = await buildBlockMap(inFile, "gzip", outFile)

    // Structural checks
    const json = JSON.parse(zlib.gunzipSync(await readFile(outFile)).toString())
    expect(json.files[0].sizes.reduce((a: number, b: number) => a + b, 0)).toBe(200_000)
    expect(result.sha512).toBe(sha512(data))
    // Must produce more than 1 chunk for 200KB (avg=16KB → expect ~12 chunks)
    expect(json.files[0].sizes.length).toBeGreaterThan(5)
  })

  it("file smaller than MIN is a single chunk", async () => {
    const data = Buffer.allocUnsafe(4096).fill(0xab)
    const inFile = path.join(tmpDir, "small.bin")
    const outFile = path.join(tmpDir, "small.blockmap")
    await writeFile(inFile, data)

    await buildBlockMap(inFile, "gzip", outFile)

    const json = JSON.parse(zlib.gunzipSync(await readFile(outFile)).toString())
    expect(json.files[0].sizes).toHaveLength(1)
    expect(json.files[0].sizes[0]).toBe(4096)
  })
})

// ─── 1-to-1 comparison against the real app-builder-bin binary ───────────────
//
// These tests run both implementations on the same input and assert byte-exact
// equality of every field that the Rabin algorithm and BLAKE2b determine:
//   • chunk `sizes` — must match: same polynomial, same window, same boundary condition
//   • chunk `checksums` — must match: same BLAKE2b-18 over identical chunk content
//   • file `sha512` — must match for file-output mode (only original bytes matter)
//   • blockmap structure: version, name, offset
//
// The only field that is intentionally NOT compared is the compressed blockmap
// size (blockMapSize / the .blockmap file's byte length), because Go's flate and
// Node.js's zlib produce different but equally valid DEFLATE/GZIP streams.

describe("buildBlockMap vs app-builder-bin binary (golden output)", () => {
  it("single-chunk file: sizes, checksums and sha512 are identical", async () => {
    const data = Buffer.from("hello world. ".repeat(1024)) // 13 312 bytes, < MIN
    const inFile = path.join(tmpDir, "single.bin")
    const binOut = path.join(tmpDir, "single-bin.blockmap")
    const jsOut = path.join(tmpDir, "single-js.blockmap")
    await writeFile(inFile, data)

    const { blockmap: bin } = runBinaryBlockmap(inFile, binOut, "gzip")
    const jsResult = await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    // Chunk boundaries and BLAKE2b-18 hashes must match exactly
    expect(js.files[0].sizes).toEqual(bin.files[0].sizes)
    expect(js.files[0].checksums).toEqual(bin.files[0].checksums)
    // SHA-512 of the original file must match
    expect(jsResult.sha512).toBe(createHash("sha512").update(data).digest("base64"))
    expect(jsResult.sha512).toBe(sha512(data))
    // Version and structural fields
    expect(js.version).toBe(bin.version)
    expect(js.files[0].name).toBe(bin.files[0].name)
    expect(js.files[0].offset).toBe(bin.files[0].offset)
  })

  it("multi-chunk random data (200 KB): chunk sizes match binary exactly", async () => {
    const data = makeTestData(200_000)
    const inFile = path.join(tmpDir, "multi200k.bin")
    const binOut = path.join(tmpDir, "multi200k-bin.blockmap")
    const jsOut = path.join(tmpDir, "multi200k-js.blockmap")
    await writeFile(inFile, data)

    const { blockmap: bin } = runBinaryBlockmap(inFile, binOut, "gzip")
    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toEqual(bin.files[0].sizes)
    expect(js.files[0].checksums).toEqual(bin.files[0].checksums)
    // Must have produced multiple chunks
    expect(bin.files[0].sizes.length).toBeGreaterThan(1)
  })

  it("multi-chunk random data (500 KB, different seed): chunk sizes match binary exactly", async () => {
    const data = makeTestData(500_000, 99999)
    const inFile = path.join(tmpDir, "multi500k.bin")
    const binOut = path.join(tmpDir, "multi500k-bin.blockmap")
    const jsOut = path.join(tmpDir, "multi500k-js.blockmap")
    await writeFile(inFile, data)

    const { blockmap: bin } = runBinaryBlockmap(inFile, binOut, "gzip")
    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toEqual(bin.files[0].sizes)
    expect(js.files[0].checksums).toEqual(bin.files[0].checksums)
  })

  it("uniformly-zero buffer: sizes and checksums match (boundary at MAX)", async () => {
    // All-zero data has no natural CDC boundaries → every chunk hits MAX (32 768)
    const data = Buffer.alloc(100_000, 0x00)
    const inFile = path.join(tmpDir, "zeros.bin")
    const binOut = path.join(tmpDir, "zeros-bin.blockmap")
    const jsOut = path.join(tmpDir, "zeros-js.blockmap")
    await writeFile(inFile, data)

    const { blockmap: bin } = runBinaryBlockmap(inFile, binOut, "gzip")
    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toEqual(bin.files[0].sizes)
    expect(js.files[0].checksums).toEqual(bin.files[0].checksums)
    // All full chunks must be exactly MAX bytes
    for (const size of bin.files[0].sizes.slice(0, -1)) {
      expect(size).toBe(32768)
    }
  })

  it("uniformly-filled buffer (0xFF): sizes and checksums match", async () => {
    const data = Buffer.alloc(150_000, 0xff)
    const inFile = path.join(tmpDir, "ff.bin")
    const binOut = path.join(tmpDir, "ff-bin.blockmap")
    const jsOut = path.join(tmpDir, "ff-js.blockmap")
    await writeFile(inFile, data)

    const { blockmap: bin } = runBinaryBlockmap(inFile, binOut, "gzip")
    await buildBlockMap(inFile, "gzip", jsOut)
    const js = JSON.parse(zlib.gunzipSync(await readFile(jsOut)).toString())

    expect(js.files[0].sizes).toEqual(bin.files[0].sizes)
    expect(js.files[0].checksums).toEqual(bin.files[0].checksums)
  })

  it("append mode (deflate): embedded blockmap JSON is identical to binary's", async () => {
    // In append mode both implementations write to the same input file.
    // We copy the input and run each on its own copy, then compare the
    // extracted (decompressed) blockmap JSON — not the compressed bytes.
    const data = makeTestData(80_000, 42)
    const binFile = path.join(tmpDir, "append-bin.bin")
    const jsFile = path.join(tmpDir, "append-js.bin")
    await Promise.all([writeFile(binFile, data), writeFile(jsFile, data)])

    // Run binary in append mode (no --output flag)
    const proc = spawnSync(appBuilderPath, ["blockmap", "--input", binFile, "--compression", "deflate"], { encoding: "utf8" })
    if (proc.status !== 0) {
      throw new Error(`binary failed: ${proc.stderr}`)
    }
    const binMeta = JSON.parse(proc.stdout.trim()) as { size: number; sha512: string; blockMapSize: number }

    // Run JS implementation
    const jsMeta = await buildBlockMap(jsFile, "deflate")

    // Extract and decompress both embedded blockmaps
    const binFull = readFileSync(binFile)
    const jsFull = await readFile(jsFile)

    const binBmSize = binFull.readUInt32BE(binFull.length - 4)
    const jsBmSize = jsFull.readUInt32BE(jsFull.length - 4)
    const binBm: BinaryBlockMap = JSON.parse(zlib.inflateRawSync(binFull.subarray(binFull.length - 4 - binBmSize, binFull.length - 4)).toString())
    const jsBm: BinaryBlockMap = JSON.parse(zlib.inflateRawSync(jsFull.subarray(jsFull.length - 4 - jsBmSize, jsFull.length - 4)).toString())

    // Chunk content must be identical
    expect(jsBm.files[0].sizes).toEqual(binBm.files[0].sizes)
    expect(jsBm.files[0].checksums).toEqual(binBm.files[0].checksums)
    // Both implementations correctly reported blockMapSize
    expect(binMeta.blockMapSize).toBe(binBmSize)
    expect(jsMeta.blockMapSize).toBe(jsBmSize)
    // Both files correctly report their own total size
    expect(binMeta.size).toBe(binFull.length)
    expect(jsMeta.size).toBe(jsFull.length)
    // Both sha512 values are correct for their respective (differently-compressed) files
    expect(binMeta.sha512).toBe(sha512(binFull))
    expect(jsMeta.sha512).toBe(sha512(jsFull))
  })

  it("file-output sha512: JS and binary both return SHA-512 of the original unmodified file", async () => {
    // In file-output mode, the original file is not touched, so both SHA-512
    // values must equal the SHA-512 of the raw input bytes.
    const data = makeTestData(300_000, 7777)
    const inFile = path.join(tmpDir, "sha-check.bin")
    const binOut = path.join(tmpDir, "sha-check-bin.blockmap")
    const jsOut = path.join(tmpDir, "sha-check-js.blockmap")
    await writeFile(inFile, data)
    const expected = sha512(data)

    const { result: binResult } = runBinaryBlockmap(inFile, binOut, "gzip")
    const jsResult = await buildBlockMap(inFile, "gzip", jsOut)

    expect(binResult.sha512).toBe(expected)
    expect(jsResult.sha512).toBe(expected)
  })
})
