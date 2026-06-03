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
  test("7z default compression adds -mx=9", ({ expect }) => {
    const args = compute7zCompressArgs("7z", {})
    expect(args).toContain("-mx=9")
    expect(args).not.toContain("-mm=Copy")
  })

  test("zip default uses level 7", ({ expect }) => {
    const args = compute7zCompressArgs("zip", {})
    expect(args).toContain("-mx=7")
    expect(args).toContain("-mm=Deflate")
    expect(args).toContain("-mcu")
  })

  test("zip maximum adds extra deflate passes and level 9", ({ expect }) => {
    const args = compute7zCompressArgs("zip", { compression: "maximum" })
    expect(args).toContain("-mx=9")
    expect(args).toContain("-mfb=258")
    expect(args).toContain("-mpass=15")
  })

  test("store mode adds -mx=0 (universal store flag)", ({ expect }) => {
    const args = compute7zCompressArgs("7z", { compression: "store" })
    expect(args).toContain("-mx=0")
    // -mm=Copy is NOT added for 7z store — -mx=0 is the universal no-compression flag
    // and -mm=Copy would be invalid for xz/gzip/bzip2 formats
    expect(args).not.toContain("-mm=Copy")
  })

  test("zip store mode adds -mm=Copy", ({ expect }) => {
    const args = compute7zCompressArgs("zip", { compression: "store" })
    expect(args).toContain("-mm=Copy")
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

  test("valid ELECTRON_BUILDER_7Z_FILTER is included", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_7Z_FILTER", "BCJ2")
    expect(compute7zCompressArgs("7z", {})).toContain("-mf=BCJ2")
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

  test("isRegularFile suppresses -mtc=off", ({ expect }) => {
    const args = compute7zCompressArgs("7z", { isRegularFile: true })
    expect(args).not.toContain("-mtc=off")
    // but still has the other timestamp flags
    expect(args).toContain("-mtm=off")
    expect(args).toContain("-mta=off")
  })
})

// ─── archive() — path-level guards (no binary needed) ───────────────────────

describe("archive() guards", () => {
  test("excluded pattern with '..' throws before reaching 7za", async ({ expect }) => {
    const src = await makeSrcDir()
    await expect(archive("zip", path.join(tmpDir, "out.zip"), src, { excluded: ["../secret"] })).rejects.toThrow("path traversal sequence")
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
})
