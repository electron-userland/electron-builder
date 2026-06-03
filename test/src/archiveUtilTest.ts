// archive() is @internal and stripped from type declarations by stripInternal:true.
// Import as namespace then cast to any so vitest's TypeScript transform still resolves
// the real source exports while TypeScript type-checking is satisfied.
import * as archiveModule from "app-builder-lib/src/targets/archive"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { archive, compute7zCompressArgs } = archiveModule as any
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// ─── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-archive-test-"))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

async function makeSrcDir(files: Record<string, string> = { "hello.txt": "hello world", "sub/nested.txt": "nested" }): Promise<string> {
  const src = path.join(tmpDir, "src")
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(src, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content)
  }
  return src
}

// ─── compute7zCompressArgs ───────────────────────────────────────────────────

describe("compute7zCompressArgs", () => {
  test("default compression adds -mx=9", ({ expect }) => {
    const args = compute7zCompressArgs("7z", {})
    expect(args).toContain("-mx=9")
    expect(args).not.toContain("-mm=Copy")
  })

  test("store mode adds -mm=Copy and omits -mx", ({ expect }) => {
    const args = compute7zCompressArgs("7z", { compression: "store" })
    expect(args).toContain("-mm=Copy")
    expect(args.some((a: string) => a.startsWith("-mx="))).toBe(false)
  })

  test("ELECTRON_BUILDER_COMPRESSION_LEVEL overrides store mode", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_COMPRESSION_LEVEL", "5")
    const args = compute7zCompressArgs("7z", { compression: "store" })
    expect(args).toContain("-mx=5")
    expect(args).not.toContain("-mm=Copy")
  })

  test("ELECTRON_BUILDER_COMPRESSION_LEVEL overrides default level", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_COMPRESSION_LEVEL", "3")
    const args = compute7zCompressArgs("7z", {})
    expect(args).toContain("-mx=3")
    expect(args.filter((a: string) => a.startsWith("-mx="))).toHaveLength(1)
  })

  test("invalid ELECTRON_BUILDER_COMPRESSION_LEVEL throws", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_COMPRESSION_LEVEL", "99")
    expect(() => compute7zCompressArgs("7z", {})).toThrow("ELECTRON_BUILDER_COMPRESSION_LEVEL must be a single digit 0-9")
  })

  test("7z format adds reproducibility timestamp flags", ({ expect }) => {
    const args = compute7zCompressArgs("7z", {})
    expect(args).toContain("-mtm=off")
    expect(args).toContain("-mta=off")
    expect(args).toContain("-mtc=off")
  })

  test("solid=false adds -ms=off", ({ expect }) => {
    expect(compute7zCompressArgs("7z", { solid: false })).toContain("-ms=off")
  })

  test("isArchiveHeaderCompressed=false adds -mhc=off", ({ expect }) => {
    expect(compute7zCompressArgs("7z", { isArchiveHeaderCompressed: false })).toContain("-mhc=off")
  })

  test("invalid ELECTRON_BUILDER_7Z_FILTER throws", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_7Z_FILTER", "NOTAFILTER")
    expect(() => compute7zCompressArgs("7z", {})).toThrow("ELECTRON_BUILDER_7Z_FILTER must be one of")
  })

  test("valid ELECTRON_BUILDER_7Z_FILTER is included case-insensitively", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_7Z_FILTER", "bcj2")
    expect(compute7zCompressArgs("7z", {})).toContain("-mf=bcj2")
  })

  test("dictSize adds -md flag", ({ expect }) => {
    expect(compute7zCompressArgs("7z", { dictSize: 64 })).toContain("-md=64m")
  })

  test("method=LZMA adds -mm=LZMA", ({ expect }) => {
    expect(compute7zCompressArgs("7z", { method: "LZMA" })).toContain("-mm=LZMA")
  })

  test("method=DEFAULT suppresses -mm flag", ({ expect }) => {
    expect(compute7zCompressArgs("7z", { method: "DEFAULT" }).some((a: string) => a.startsWith("-mm="))).toBe(false)
  })
})

// ─── archive() — zip format (archiver) ──────────────────────────────────────

describe("archive() zip format", () => {
  test.ifNotWindows("creates a non-empty zip file", async ({ expect }) => {
    const src = await makeSrcDir()
    const outFile = path.join(tmpDir, "out.zip")
    const result = await archive("zip", outFile, src)
    expect(result).toBe(outFile)
    expect((await fs.stat(outFile)).size).toBeGreaterThan(0)
  })

  test.ifNotWindows("withoutDir:false produces a valid zip", async ({ expect }) => {
    const src = await makeSrcDir({ "file.txt": "x" })
    const outFile = path.join(tmpDir, "with-dir.zip")
    await archive("zip", outFile, src, { withoutDir: false })
    expect((await fs.stat(outFile)).size).toBeGreaterThan(0)
  })

  test.ifNotWindows("withoutDir:true produces a valid zip", async ({ expect }) => {
    const src = await makeSrcDir({ "file.txt": "x" })
    const outFile = path.join(tmpDir, "no-dir.zip")
    await archive("zip", outFile, src, { withoutDir: true })
    expect((await fs.stat(outFile)).size).toBeGreaterThan(0)
  })

  test.ifNotWindows("excluded pattern omits matched files", async ({ expect }) => {
    const src = await makeSrcDir({ "video.mp4": "binary data", "text.txt": "hello" })
    const outFile = path.join(tmpDir, "out.zip")
    await archive("zip", outFile, src, { excluded: ["*.mp4"] })
    // Archive exists — the mp4 was excluded so the only file is text.txt
    // The zip will be smaller than one that includes the mp4
    const statExcluded = (await fs.stat(outFile)).size

    const outFileAll = path.join(tmpDir, "out-all.zip")
    await archive("zip", outFileAll, src)
    const statAll = (await fs.stat(outFileAll)).size

    expect(statExcluded).toBeLessThan(statAll)
  })

  test("excluded pattern with '..' throws path traversal error", async ({ expect }) => {
    const src = await makeSrcDir()
    await expect(archive("zip", path.join(tmpDir, "out.zip"), src, { excluded: ["../secret"] })).rejects.toThrow("path traversal sequence")
  })

  test("throws when source directory does not exist", async ({ expect }) => {
    await expect(archive("zip", path.join(tmpDir, "out.zip"), path.join(tmpDir, "no-such-dir"))).rejects.toThrow("doesn't exist")
  })

  test.ifNotWindows("store compression level produces a valid zip", async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_COMPRESSION_LEVEL", "0")
    const src = await makeSrcDir()
    const outFile = path.join(tmpDir, "stored.zip")
    await archive("zip", outFile, src)
    expect((await fs.stat(outFile)).size).toBeGreaterThan(0)
  })

  test.ifNotWindows("skips archiving when output is newer than source dir", async ({ expect }) => {
    const src = await makeSrcDir()
    const outFile = path.join(tmpDir, "cached.zip")
    await fs.writeFile(outFile, "sentinel")
    const future = new Date(Date.now() + 60_000)
    await fs.utimes(outFile, future, future)

    const result = await archive("zip", outFile, src)
    expect(result).toBe(outFile)
    expect(await fs.readFile(outFile, "utf8")).toBe("sentinel")
  })

  test.ifNotWindows("overwrites pre-existing output file", async ({ expect }) => {
    const src = await makeSrcDir()
    const outFile = path.join(tmpDir, "overwrite.zip")
    // Create a stale output with an old mtime so the cache check doesn't skip
    await fs.writeFile(outFile, "stale")
    const past = new Date(Date.now() - 60_000)
    await fs.utimes(outFile, past, past)

    await archive("zip", outFile, src)
    const contents = await fs.readFile(outFile)
    // A real zip starts with the local file header signature PK\x03\x04
    expect(contents.slice(0, 2).toString()).toBe("PK")
  })
})
