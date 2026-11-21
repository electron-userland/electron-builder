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

export interface ZipEntrySpec {
  name: string
  content?: Buffer
  /** Unix mode stored in the external file attributes; 0 stores none. */
  mode?: number
}

export const UNIX_SYMLINK_MODE = 0o120000

/**
 * Builds a minimal but well-formed, uncompressed ZIP buffer. Entry names may contain path traversal
 * sequences (e.g. "../evil.txt") — adm-zip normalises these away, so we hand-craft the bytes here.
 * A symlink entry stores its target as the content and UNIX_SYMLINK_MODE as its mode.
 */
export function buildZip(entries: ZipEntrySpec[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const { name, content = Buffer.alloc(0), mode = 0 } of entries) {
    const nameBytes = Buffer.from(name)
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

    // Central directory header (46 bytes + name)
    const cdh = Buffer.alloc(46 + nameBytes.length)
    cdh.writeUInt32LE(0x02014b50, 0) // PK\x01\x02 signature
    cdh.writeUInt16LE(20, 4) // version made by
    cdh.writeUInt16LE(20, 6) // version needed
    cdh.writeUInt32LE(dataCrc, 16) // crc-32
    cdh.writeUInt32LE(content.length, 20) // compressed size
    cdh.writeUInt32LE(content.length, 24) // uncompressed size
    cdh.writeUInt16LE(nameBytes.length, 28) // file name length
    cdh.writeUInt32LE((mode << 16) >>> 0, 38) // external file attributes: Unix mode in the high 16 bits
    cdh.writeUInt32LE(offset, 42) // local header offset
    nameBytes.copy(cdh, 46)

    localParts.push(lfh, content)
    centralParts.push(cdh)
    offset += lfh.length + content.length
  }
  const centralDir = Buffer.concat(centralParts)

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // PK\x05\x06 signature
  eocd.writeUInt16LE(entries.length, 8) // total entries on this disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  eocd.writeUInt32LE(centralDir.length, 12) // size of central dir
  eocd.writeUInt32LE(offset, 16) // offset of central dir from start of disk

  return Buffer.concat([...localParts, centralDir, eocd])
}
