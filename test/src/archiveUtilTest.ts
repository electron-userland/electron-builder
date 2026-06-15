import { archive, compute7zCompressArgs } from "app-builder-lib/src/targets/archive"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

async function makeSrcDir(tmpDir: string, files: Record<string, string> = { "hello.txt": "hello world", "sub/nested.txt": "nested" }): Promise<string> {
  const src = path.join(tmpDir, "src")
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(src, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content)
  }
  return src
}

// ─── compute7zCompressArgs ───────────────────────────────────────────────────

describe("compute7zCompressArgs", { sequential: true }, () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  // Regression: -mm=Copy is only valid for zip/7z; using it with xz/gzip/bzip2 causes E_INVALIDARG.
  test("xz store mode uses -mx=0, never -mm=Copy", ({ expect }) => {
    const args = compute7zCompressArgs("xz", { compression: "store" })
    expect(args).toContain("-mx=0")
    expect(args).not.toContain("-mm=Copy")
  })

  test("gzip store mode uses -mx=0, never -mm=Copy", ({ expect }) => {
    const args = compute7zCompressArgs("gzip", { compression: "store" })
    expect(args).toContain("-mx=0")
    expect(args).not.toContain("-mm=Copy")
  })

  test("bzip2 store mode uses -mx=0, never -mm=Copy", ({ expect }) => {
    const args = compute7zCompressArgs("bzip2", { compression: "store" })
    expect(args).toContain("-mx=0")
    expect(args).not.toContain("-mm=Copy")
  })
})

// ─── archive() — path-level guards (no binary needed) ───────────────────────

describe("archive() guards", { sequential: true }, () => {
  let tmpDir: string
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-archive-test-"))
  })
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("excluded pattern with '..' throws", async ({ expect }) => {
    const src = await makeSrcDir(tmpDir)
    await expect(archive("zip", path.join(tmpDir, "out.zip"), src, { excluded: ["../secret"] })).rejects.toThrow("path traversal sequence")
  })

  test.ifNotWindows("skips archiving when output is newer than source dir", async ({ expect }) => {
    const src = await makeSrcDir(tmpDir)
    const outFile = path.join(tmpDir, "cached.zip")
    await fs.writeFile(outFile, "sentinel")
    const future = new Date(Date.now() + 60_000)
    await fs.utimes(outFile, future, future)

    const result = await archive("zip", outFile, src)
    expect(result).toBe(outFile)
    expect(await fs.readFile(outFile, "utf8")).toBe("sentinel")
  })
})

// ─── archive() — macOS symlink preservation ──────────────────────────────────

describe.runIf(process.platform === "darwin")("archive() macOS symlink preservation", { sequential: true }, () => {
  let tmpDir: string
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-archive-test-"))
  })
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("zip archive preserves symlinks (not dereferenced)", async ({ expect }) => {
    const src = path.join(tmpDir, "src")
    await fs.mkdir(src, { recursive: true })
    await fs.writeFile(path.join(src, "real.txt"), "content")
    await fs.symlink("real.txt", path.join(src, "link.txt"))

    const outFile = path.join(tmpDir, "out.zip")
    await archive("zip", outFile, src, { withoutDir: true, preserveSymlinks: true })

    // Extract and verify symlink is preserved
    const extractDir = path.join(tmpDir, "extracted")
    await fs.mkdir(extractDir, { recursive: true })
    const { exec: cpExec } = await import("child_process")
    const { promisify } = await import("util")
    const execAsync = promisify(cpExec)
    await execAsync(`unzip -q "${outFile}" -d "${extractDir}"`)

    const linkStat = await fs.lstat(path.join(extractDir, "link.txt"))
    expect(linkStat.isSymbolicLink()).toBe(true)
    const target = await fs.readlink(path.join(extractDir, "link.txt"))
    expect(target).toBe("real.txt")
  })

  // Regression for #9846: the 7z target must also preserve symlinks (-snl). Modern 7-Zip
  // dereferences them by default, which corrupts .framework bundles and breaks codesign.
  test("7z archive preserves symlinks (not dereferenced)", async ({ expect }) => {
    const src = path.join(tmpDir, "src7z")
    await fs.mkdir(src, { recursive: true })
    await fs.writeFile(path.join(src, "real.txt"), "content")
    await fs.symlink("real.txt", path.join(src, "link.txt"))

    const outFile = path.join(tmpDir, "out.7z")
    await archive("7z", outFile, src, { withoutDir: true, preserveSymlinks: true })

    // Extract with the same 7za toolset binary and verify the symlink survived
    const extractDir = path.join(tmpDir, "extracted7z")
    await fs.mkdir(extractDir, { recursive: true })
    const { getPath7za } = await import("app-builder-lib/src/toolsets/7zip")
    const { exec: cpExec } = await import("child_process")
    const { promisify } = await import("util")
    const execAsync = promisify(cpExec)
    await execAsync(`"${await getPath7za()}" x -o"${extractDir}" "${outFile}"`)

    const linkStat = await fs.lstat(path.join(extractDir, "link.txt"))
    expect(linkStat.isSymbolicLink()).toBe(true)
    const target = await fs.readlink(path.join(extractDir, "link.txt"))
    expect(target).toBe("real.txt")
  })

  test("excluded pattern with '..' throws when preserveSymlinks is set", async ({ expect }) => {
    const src = await makeSrcDir(tmpDir)
    await expect(archive("zip", path.join(tmpDir, "out.zip"), src, { excluded: ["../secret"], preserveSymlinks: true })).rejects.toThrow("path traversal sequence")
  })
})
