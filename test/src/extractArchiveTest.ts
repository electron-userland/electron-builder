import { extractArchive } from "app-builder-lib/src/toolsets/custom"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, test } from "vitest"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-extract-test-"))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
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

describe("extractArchive ZIP security guards", () => {
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
})
