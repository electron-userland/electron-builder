import { extractArchive, isSafeExtractPath, moveDirAtomic } from "app-builder-lib/src/util/electronGet"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
})

// Minimal CRC32 implementation needed for non-empty ZIP entries.
function crc32(buf: Buffer): number {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Builds a minimal but well-formed ZIP buffer with a single file entry.
 * entryName may contain path traversal sequences (e.g. "../evil.txt") — adm-zip
 * normalises these away, so we hand-craft the bytes here.
 */
function buildZipWithFileEntry(entryName: string, content = Buffer.alloc(0)): Buffer {
  const nameBytes = Buffer.from(entryName)
  const dataCrc = crc32(content)

  // Local file header (30 bytes + name)
  const lfh = Buffer.alloc(30 + nameBytes.length)
  lfh.writeUInt32LE(0x04034b50, 0) // PK\x03\x04 signature
  lfh.writeUInt16LE(20, 4) // version needed to extract (2.0)
  lfh.writeUInt32LE(dataCrc, 14) // crc-32
  lfh.writeUInt32LE(content.length, 18) // compressed size
  lfh.writeUInt32LE(content.length, 22) // uncompressed size
  lfh.writeUInt16LE(nameBytes.length, 26) // file name length
  nameBytes.copy(lfh, 30)

  const centralDirOffset = lfh.length + content.length

  // Central directory header (46 bytes + name)
  const cdh = Buffer.alloc(46 + nameBytes.length)
  cdh.writeUInt32LE(0x02014b50, 0) // PK\x01\x02 signature
  cdh.writeUInt16LE(20, 4) // version made by
  cdh.writeUInt16LE(20, 6) // version needed
  cdh.writeUInt32LE(dataCrc, 16) // crc-32
  cdh.writeUInt32LE(content.length, 20) // compressed size
  cdh.writeUInt32LE(content.length, 24) // uncompressed size
  cdh.writeUInt16LE(nameBytes.length, 28) // file name length
  cdh.writeUInt32LE(0 /* local header offset */, 42)
  nameBytes.copy(cdh, 46)

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // PK\x05\x06 signature
  eocd.writeUInt16LE(1, 8) // total entries on this disk
  eocd.writeUInt16LE(1, 10) // total entries
  eocd.writeUInt32LE(cdh.length, 12) // size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16) // offset of central dir from start of disk

  return Buffer.concat([lfh, content, cdh, eocd])
}

/**
 * Builds a ZIP with a single Unix symlink entry. The symlink target is stored as the
 * file content; the Unix mode in the central directory marks it as a symlink
 * (0o120000 << 16 in the external file attributes).
 */
function buildZipWithSymlinkEntry(linkName: string, target: string): Buffer {
  const content = Buffer.from(target)
  const nameBytes = Buffer.from(linkName)
  const dataCrc = crc32(content)
  const UNIX_SYMLINK_MODE = (0o120000 << 16) >>> 0

  const lfh = Buffer.alloc(30 + nameBytes.length)
  lfh.writeUInt32LE(0x04034b50, 0)
  lfh.writeUInt16LE(20, 4)
  lfh.writeUInt32LE(dataCrc, 14)
  lfh.writeUInt32LE(content.length, 18)
  lfh.writeUInt32LE(content.length, 22)
  lfh.writeUInt16LE(nameBytes.length, 26)
  nameBytes.copy(lfh, 30)

  const centralDirOffset = lfh.length + content.length

  const cdh = Buffer.alloc(46 + nameBytes.length)
  cdh.writeUInt32LE(0x02014b50, 0)
  cdh.writeUInt16LE(20, 4)
  cdh.writeUInt16LE(20, 6)
  cdh.writeUInt32LE(dataCrc, 16)
  cdh.writeUInt32LE(content.length, 20)
  cdh.writeUInt32LE(content.length, 24)
  cdh.writeUInt16LE(nameBytes.length, 28)
  cdh.writeUInt32LE(UNIX_SYMLINK_MODE, 38) // external file attributes: Unix symlink
  cdh.writeUInt32LE(0, 42)
  nameBytes.copy(cdh, 46)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(cdh.length, 12)
  eocd.writeUInt32LE(centralDirOffset, 16)

  return Buffer.concat([lfh, content, cdh, eocd])
}

// sequence.concurrent is enabled globally; tmpDir is local to this describe so
// concurrent sibling describes cannot overwrite it.
describe.sequential("extractArchive ZIP security guards", () => {
  let tmpDir: string
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-extract-test-"))
  })
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("blocks a path traversal entry (../escape.txt)", async ({ expect }) => {
    const zipPath = path.join(tmpDir, "traversal.zip")
    await fs.writeFile(zipPath, buildZipWithFileEntry("../escape.txt"))
    const extractDir = path.join(tmpDir, "out")
    await expect(extractArchive(zipPath, extractDir)).rejects.toThrow("Path traversal blocked")
  })

  test("blocks an absolute symlink target", async ({ expect }) => {
    const zipPath = path.join(tmpDir, "abs-symlink.zip")
    await fs.writeFile(zipPath, buildZipWithSymlinkEntry("link.txt", "/etc/passwd"))
    const extractDir = path.join(tmpDir, "out")
    await expect(extractArchive(zipPath, extractDir)).rejects.toThrow("Absolute symlink target blocked")
  })

  test("blocks a relative symlink that escapes the extraction directory", async ({ expect }) => {
    const zipPath = path.join(tmpDir, "rel-symlink.zip")
    await fs.writeFile(zipPath, buildZipWithSymlinkEntry("link.txt", "../../outside"))
    const extractDir = path.join(tmpDir, "out")
    await expect(extractArchive(zipPath, extractDir)).rejects.toThrow("Symlink target escapes extraction dir")
  })

  test("extracts a valid zip entry to the correct destination", async ({ expect }) => {
    const content = Buffer.from("hello world")
    const zipPath = path.join(tmpDir, "valid.zip")
    await fs.writeFile(zipPath, buildZipWithFileEntry("hello.txt", content))
    const extractDir = path.join(tmpDir, "out")
    await extractArchive(zipPath, extractDir)
    const result = await fs.readFile(path.join(extractDir, "hello.txt"))
    expect(result.toString()).toBe("hello world")
  })
})

// ─── isSafeExtractPath ────────────────────────────────────────────────────────

describe("isSafeExtractPath", () => {
  const sep = path.sep

  test("allows a direct child of dir", ({ expect }) => {
    const dir = path.join(os.tmpdir(), "base")
    expect(isSafeExtractPath(path.join(dir, "file.txt"), dir)).toBe(true)
  })

  test("allows a nested child of dir", ({ expect }) => {
    const dir = path.join(os.tmpdir(), "base")
    expect(isSafeExtractPath(path.join(dir, "sub", "file.txt"), dir)).toBe(true)
  })

  test("blocks a sibling of dir (same-length prefix attack)", ({ expect }) => {
    const dir = path.join(os.tmpdir(), "base")
    // e.g. /tmp/base-evil — starts with /tmp/base but is not inside it
    const sibling = dir + "-evil" + sep + "file.txt"
    expect(isSafeExtractPath(sibling, dir)).toBe(false)
  })

  test("allows destPath === dir (directory entry)", ({ expect }) => {
    const dir = path.join(os.tmpdir(), "base")
    expect(isSafeExtractPath(dir, dir)).toBe(true)
  })

  test("blocks a path traversal that escapes via ..", ({ expect }) => {
    const dir = path.join(os.tmpdir(), "base")
    // path.resolve would have already normalised the .. away, giving a path outside dir
    const escaped = path.resolve(dir, "..", "outside", "file.txt")
    expect(isSafeExtractPath(escaped, dir)).toBe(false)
  })

  // Windows case-insensitivity: simulate by checking with uppercase dir on win32.
  // On non-Windows platforms the check remains case-sensitive (by design).
  test("is case-insensitive on win32, case-sensitive on posix", ({ expect }) => {
    if (process.platform === "win32") {
      const dir = "C:\\builds\\dist\\win-unpacked.tmp"
      expect(isSafeExtractPath("C:\\Builds\\Dist\\Win-Unpacked.tmp\\electron.exe", dir)).toBe(true)
    } else {
      const dir = "/tmp/base"
      // On POSIX, different case is a genuinely different path — must not be treated as safe
      expect(isSafeExtractPath("/tmp/BASE/file.txt", dir)).toBe(false)
    }
  })
})

// ─── moveDirAtomic ────────────────────────────────────────────────────────────

// sequence.concurrent is enabled globally; tmpDir is local so concurrent sibling
// describes cannot overwrite it mid-test.
describe.sequential("moveDirAtomic", () => {
  let tmpDir: string
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-extract-test-"))
  })
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("moves a directory with files to the destination", async ({ expect }) => {
    const src = path.join(tmpDir, "src")
    const dest = path.join(tmpDir, "dest")
    await fs.mkdir(src)
    await fs.writeFile(path.join(src, "file.txt"), "content")

    await moveDirAtomic(src, dest)

    const destStat = await fs.stat(dest)
    expect(destStat.isDirectory()).toBe(true)
    const content = await fs.readFile(path.join(dest, "file.txt"), "utf-8")
    expect(content).toBe("content")
    // source must be gone
    await expect(fs.access(src)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("moves when destination was pre-removed before the call", async ({ expect }) => {
    const src = path.join(tmpDir, "src")
    const dest = path.join(tmpDir, "dest")
    await fs.mkdir(src)
    await fs.writeFile(path.join(src, "new.txt"), "new")
    await fs.mkdir(dest)
    await fs.writeFile(path.join(dest, "old.txt"), "old")

    // Rename on most systems will fail when dest already exists as a directory;
    // moveDirAtomic is expected to be called after fs.rm(dest) in extractArchive.
    // But if dest was already removed, this should work fine.
    await fs.rm(dest, { recursive: true, force: true })
    await moveDirAtomic(src, dest)

    const files = await fs.readdir(dest)
    expect(files).toContain("new.txt")
    expect(files).not.toContain("old.txt")
  })

  test("throws when source does not exist", async ({ expect }) => {
    const src = path.join(tmpDir, "nonexistent")
    const dest = path.join(tmpDir, "dest")
    // Should throw (and not loop forever). We don't care about the exact code since
    // multiple retries produce the same error class.
    await expect(moveDirAtomic(src, dest)).rejects.toThrow()
  })
})
