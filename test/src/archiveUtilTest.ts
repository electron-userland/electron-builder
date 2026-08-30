import { archive, compute7zCompressArgs, shouldPreserveSymlinks } from "app-builder-lib/src/targets/archive"
import { Platform } from "app-builder-lib/src/core"
import * as fs from "fs/promises"
import * as path from "path"
import { afterEach, vi } from "vitest"
import { listArchiveEntries, listArchiveMethods, NON_DECODABLE_NSIS_FILTER } from "./helpers/archiveHelper"

async function makeSrcDir(tmpDir: string, files: Record<string, string> = { "hello.txt": "hello world", "sub/nested.txt": "nested" }): Promise<string> {
  const src = path.join(tmpDir, "src")
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(src, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content)
  }
  return src
}

// Builds a minimal but structurally valid PE32+ whose `.text` section 7za recognizes as executable
// code for `machine` (0x8664 = x64, 0x14c = x86, 0xaa64 = arm64). 7za selects the branch filter by
// content (a synthetic byte blob does not trigger it), so a real PE header + machine type is needed
// to reproduce the #9983 condition. The section is filled with dense x86 CALL rel32 + NOP so the
// converter has real work to do.
function buildMinimalPE(machine: number, codeSize = 120_000): Buffer {
  const dos = Buffer.alloc(64)
  dos.write("MZ", 0)
  dos.writeUInt32LE(64, 0x3c) // e_lfanew → PE header immediately after the DOS header
  const peSig = Buffer.from("PE\0\0", "latin1")
  const coff = Buffer.alloc(20)
  coff.writeUInt16LE(machine, 0) // Machine
  coff.writeUInt16LE(1, 2) // NumberOfSections
  coff.writeUInt16LE(0xf0, 16) // SizeOfOptionalHeader (PE32+)
  coff.writeUInt16LE(0x22, 18) // Characteristics: EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE
  const opt = Buffer.alloc(0xf0)
  opt.writeUInt16LE(0x20b, 0) // PE32+ magic
  opt.writeUInt32LE(0x1000, 16) // AddressOfEntryPoint
  opt.writeUInt32LE(0x1000, 20) // BaseOfCode
  opt.writeBigUInt64LE(0x140000000n, 24) // ImageBase
  opt.writeUInt32LE(0x1000, 32) // SectionAlignment
  opt.writeUInt32LE(0x200, 36) // FileAlignment
  const section = Buffer.alloc(40)
  section.write(".text", 0)
  section.writeUInt32LE(codeSize, 8) // VirtualSize
  section.writeUInt32LE(0x1000, 12) // VirtualAddress
  section.writeUInt32LE(codeSize, 16) // SizeOfRawData
  const header = Buffer.concat([dos, peSig, coff, opt, section])
  const rawPtr = Math.ceil(header.length / 0x200) * 0x200
  section.writeUInt32LE(rawPtr, 20) // PointerToRawData
  section.writeUInt32LE(0x60000020, 36) // Characteristics: CODE | EXECUTE | READ
  const code = Buffer.alloc(codeSize)
  let p = 0
  while (p < code.length - 6) {
    code[p++] = 0xe8 // CALL rel32
    code.writeInt32LE(((p * 7) % 5000) - 2500, p)
    p += 4
    code[p++] = 0x90 // NOP
  }
  // `section` was mutated after the first concat — rebuild the header so the updated section is used.
  return Buffer.concat([dos, peSig, coff, opt, section, Buffer.alloc(rawPtr - header.length), code])
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

  test("ELECTRON_BUILDER_7Z_FILTER is normalized to canonical uppercase", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_7Z_FILTER", "bcj")
    expect(compute7zCompressArgs("7z", {})).toContain("-mf=BCJ")
  })

  test("ELECTRON_BUILDER_7Z_FILTER=off disables the filter (plain LZMA2)", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_7Z_FILTER", "off")
    expect(compute7zCompressArgs("7z", {})).toContain("-mf=OFF")
  })

  // #9983: NSIS packs with installTimeDecodable so 7za uses a filter (BCJ, never BCJ2/ARM64) the
  // install-time Nsis7z extractor can actually read.
  test("installTimeDecodable pins the 7z filter to BCJ when compressing", ({ expect }) => {
    expect(compute7zCompressArgs("7z", { installTimeDecodable: true })).toContain("-mf=BCJ")
  })

  test("installTimeDecodable adds no filter in store mode (Copy needs none)", ({ expect }) => {
    const args = compute7zCompressArgs("7z", { installTimeDecodable: true, compression: "store" })
    expect(args.some((a: string) => a.startsWith("-mf="))).toBe(false)
    expect(args).toContain("-mx=0")
  })

  test("no -mf flag is emitted by default (7za auto-selects the filter)", ({ expect }) => {
    expect(compute7zCompressArgs("7z", {}).some((a: string) => a.startsWith("-mf="))).toBe(false)
  })

  test("installTimeDecodable is a no-op for non-7z formats", ({ expect }) => {
    expect(compute7zCompressArgs("zip", { installTimeDecodable: true }).some((a: string) => a.startsWith("-mf="))).toBe(false)
  })

  test("installTimeDecodable ignores ELECTRON_BUILDER_7Z_FILTER (cannot be overridden to a non-decodable filter)", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_7Z_FILTER", "BCJ2")
    const args = compute7zCompressArgs("7z", { installTimeDecodable: true })
    expect(args).toContain("-mf=BCJ")
    expect(args).not.toContain("-mf=BCJ2")
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

describe("archive() guards", () => {
  test("excluded pattern with '..' throws", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const src = await makeSrcDir(tmpDirPath)
    await expect(archive("zip", path.join(tmpDirPath, "out.zip"), src, { excluded: ["../secret"] })).rejects.toThrow("path traversal sequence")
  })

  test.ifNotWindows("skips archiving when output is newer than source dir", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const src = await makeSrcDir(tmpDirPath)
    const outFile = path.join(tmpDirPath, "cached.zip")
    await fs.writeFile(outFile, "sentinel")
    const future = new Date(Date.now() + 60_000)
    await fs.utimes(outFile, future, future)

    const result = await archive("zip", outFile, src)
    expect(result).toBe(outFile)
    expect(await fs.readFile(outFile, "utf8")).toBe("sentinel")
  })
})

// ─── shouldPreserveSymlinks — target platform → -snl policy ──────────────────
// Regression guard for #9846 and its Linux follow-up: keyed on the target platform (not the build
// host), so a Linux distributable built on a Windows machine still preserves symlinks, and a Windows
// distributable built on macOS/Linux still dereferences. Catches narrowing the policy back to mac-only.

describe("shouldPreserveSymlinks", () => {
  test("preserves symlinks for macOS and Linux targets", ({ expect }) => {
    expect(shouldPreserveSymlinks(Platform.MAC)).toBe(true)
    expect(shouldPreserveSymlinks(Platform.LINUX)).toBe(true)
  })

  test("dereferences symlinks for Windows targets", ({ expect }) => {
    expect(shouldPreserveSymlinks(Platform.WINDOWS)).toBe(false)
  })
})

// ─── archive() — symlink preservation (non-Windows hosts) ────────────────────
// Runs on macOS and Linux: both are non-Windows archive targets that pass -snl (see ArchiveTarget).
// Windows is excluded — symlink restore there needs elevated privileges and the target dereferences.

describe.runIf(process.platform !== "win32")("archive() symlink preservation", () => {
  test("zip archive preserves symlinks (not dereferenced)", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const src = path.join(tmpDirPath, "src")
    await fs.mkdir(src, { recursive: true })
    await fs.writeFile(path.join(src, "real.txt"), "content")
    await fs.symlink("real.txt", path.join(src, "link.txt"))

    const outFile = path.join(tmpDirPath, "out.zip")
    await archive("zip", outFile, src, { withoutDir: true, preserveSymlinks: true })

    // Extract and verify symlink is preserved
    const extractDir = path.join(tmpDirPath, "extracted")
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
  test("7z archive preserves symlinks (not dereferenced)", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const src = path.join(tmpDirPath, "src7z")
    await fs.mkdir(src, { recursive: true })
    await fs.writeFile(path.join(src, "real.txt"), "content")
    await fs.symlink("real.txt", path.join(src, "link.txt"))

    const outFile = path.join(tmpDirPath, "out.7z")
    await archive("7z", outFile, src, { withoutDir: true, preserveSymlinks: true })

    // Extract with the same 7za toolset binary and verify the symlink survived
    const extractDir = path.join(tmpDirPath, "extracted7z")
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

  test("excluded pattern with '..' throws when preserveSymlinks is set", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const src = await makeSrcDir(tmpDirPath)
    await expect(archive("zip", path.join(tmpDirPath, "out.zip"), src, { excluded: ["../secret"], preserveSymlinks: true })).rejects.toThrow("path traversal sequence")
  })
})

// ─── archive() — 7z branch filter (#9983) ────────────────────────────────────
// Modern 7za auto-applies a CPU branch filter to executable content (BCJ2 on x86/x64, ARM64 on
// arm64). The install-time Nsis7z decoder can't read those streams and silently drops every PE,
// shipping an installer with no main exe. installTimeDecodable must pin the filter to one that
// decoder can read (BCJ). These pack real (minimal) PE headers through the same archive() path the
// NSIS target uses, then read back the codec actually applied.

describe("archive() 7z branch filter", () => {
  async function makePayloadDir(tmpDir: string): Promise<string> {
    const dir = path.join(tmpDir, "payload")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, "app.exe"), buildMinimalPE(0x8664)) // x64 PE → BCJ2 by default
    await fs.writeFile(path.join(dir, "native.exe"), buildMinimalPE(0xaa64)) // arm64 PE → ARM64 by default
    await fs.writeFile(path.join(dir, "resources.pak"), Buffer.alloc(40_000, 7)) // data → plain LZMA2
    return dir
  }

  // Guards that the synthetic PEs really do trigger the filter — otherwise the fix-side assertion
  // below would pass vacuously and stop protecting against the regression.
  test("default packing applies a CPU branch filter to executables (reproduces the regression)", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const dir = await makePayloadDir(tmpDirPath)
    const outFile = path.join(tmpDirPath, "default.7z")
    await archive("7z", outFile, dir, { withoutDir: true })
    // Both arch filters must appear, so the fix-side assertion below covers both x64 (BCJ2) and arm64 (ARM64).
    const methods = (await listArchiveMethods(outFile)).join("\n")
    expect(methods, "x64 PE should be packed with BCJ2 by default").toMatch(/BCJ2/)
    expect(methods, "arm64 PE should be packed with ARM64 by default").toMatch(/ARM64/)
  })

  test("installTimeDecodable packs with a decoder-readable filter (BCJ, never BCJ2/ARM64)", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const dir = await makePayloadDir(tmpDirPath)
    const outFile = path.join(tmpDirPath, "fixed.7z")
    await archive("7z", outFile, dir, { withoutDir: true, installTimeDecodable: true })
    const methods = (await listArchiveMethods(outFile)).join("\n")
    // The decodable BCJ filter is applied to the executables…
    expect(methods, "expected the decodable BCJ filter to be applied").toMatch(/\bBCJ\b/)
    // …and none of the filters the install-time decoder can't read appear (notably BCJ2/ARM64).
    expect(methods).not.toMatch(NON_DECODABLE_NSIS_FILTER)
  })
})

// ─── buildExcludeArgs (via archive()) — happy-path coverage ───────────────────
// The "../" throw path is covered by the guard tests above; this exercises the extracted helper's
// positive branch through the 7za "-xr!" prefix (recursive exclude) end-to-end.

describe("archive() exclude masks", () => {
  test("7z drops files matching an excluded mask recursively and keeps the rest", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const src = await makeSrcDir(tmpDirPath, { "keep.txt": "keep", "debug.log": "log", "nested/trace.log": "log2" })
    const outFile = path.join(tmpDirPath, "excluded.7z")
    await archive("7z", outFile, src, { withoutDir: true, excluded: ["*.log"] })
    const entries = await listArchiveEntries(outFile)
    expect(entries).toContain("keep.txt")
    expect(
      entries.some(e => e.endsWith(".log")),
      `no *.log should remain, got: ${entries.join(", ")}`
    ).toBe(false)
  })
})
