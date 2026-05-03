import * as fs from "fs-extra"

export interface ElfSection {
  offset: number
  size: number
}

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]) // \x7fELF

const ELF_CLASS_32 = 1
const ELF_CLASS_64 = 2
const ELF_DATA_LSB = 1 // Little-endian
const ELF_DATA_MSB = 2 // Big-endian

const SHA256_SIG_SECTION_NAME = ".sha256_sig"

function readUint16(buf: Buffer, offset: number, le: boolean): number {
  return le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset)
}

function readUint32(buf: Buffer, offset: number, le: boolean): number {
  return le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset)
}

function readUint64AsNumber(buf: Buffer, offset: number, le: boolean): number {
  // ELF 64-bit values — we read as two 32-bit halves.
  // Section offsets/sizes in practice fit in a safe integer range.
  if (le) {
    const lo = buf.readUInt32LE(offset)
    const hi = buf.readUInt32LE(offset + 4)
    return hi * 0x100000000 + lo
  } else {
    const hi = buf.readUInt32BE(offset)
    const lo = buf.readUInt32BE(offset + 4)
    return hi * 0x100000000 + lo
  }
}

/**
 * Parses ELF headers to find the `.sha256_sig` section used for AppImage GPG signatures.
 * Returns the section's file offset and size, or null if the section is not found.
 */
export async function findSha256SigSection(filePath: string): Promise<ElfSection | null> {
  const fd = await fs.open(filePath, "r")
  try {
    // Read ELF identification header (first 64 bytes covers both 32 and 64-bit)
    const identBuf = Buffer.alloc(64)
    await fs.read(fd, identBuf, 0, 64, 0)

    // Verify ELF magic
    if (!identBuf.subarray(0, 4).equals(ELF_MAGIC)) {
      return null
    }

    const elfClass = identBuf[4]
    if (elfClass !== ELF_CLASS_32 && elfClass !== ELF_CLASS_64) {
      return null
    }

    const encoding = identBuf[5]
    if (encoding !== ELF_DATA_LSB && encoding !== ELF_DATA_MSB) {
      return null
    }

    const le = encoding === ELF_DATA_LSB
    const is64 = elfClass === ELF_CLASS_64

    // Parse ELF header fields
    let shoff: number // Section header table offset
    let shentsize: number // Section header entry size
    let shnum: number // Number of section headers
    let shstrndx: number // Section name string table index

    if (is64) {
      // 64-bit ELF header
      shoff = readUint64AsNumber(identBuf, 40, le)
      shentsize = readUint16(identBuf, 58, le)
      shnum = readUint16(identBuf, 60, le)
      shstrndx = readUint16(identBuf, 62, le)
    } else {
      // 32-bit ELF header
      shoff = readUint32(identBuf, 32, le)
      shentsize = readUint16(identBuf, 46, le)
      shnum = readUint16(identBuf, 48, le)
      shstrndx = readUint16(identBuf, 50, le)
    }

    if (shoff === 0 || shnum === 0 || shstrndx >= shnum) {
      return null
    }

    // Read all section headers
    const shTableSize = shnum * shentsize
    const shTableBuf = Buffer.alloc(shTableSize)
    await fs.read(fd, shTableBuf, 0, shTableSize, shoff)

    // Read the section name string table
    const strTabHeaderOffset = shstrndx * shentsize
    let strTabOffset: number
    let strTabSize: number

    if (is64) {
      strTabOffset = readUint64AsNumber(shTableBuf, strTabHeaderOffset + 24, le)
      strTabSize = readUint64AsNumber(shTableBuf, strTabHeaderOffset + 32, le)
    } else {
      strTabOffset = readUint32(shTableBuf, strTabHeaderOffset + 16, le)
      strTabSize = readUint32(shTableBuf, strTabHeaderOffset + 20, le)
    }

    const strTabBuf = Buffer.alloc(strTabSize)
    await fs.read(fd, strTabBuf, 0, strTabSize, strTabOffset)

    // Iterate section headers and find .sha256_sig
    for (let i = 0; i < shnum; i++) {
      const entryOffset = i * shentsize
      const nameIndex = readUint32(shTableBuf, entryOffset, le)

      // Read null-terminated string from string table
      const nameEnd = strTabBuf.indexOf(0, nameIndex)
      const name = strTabBuf.toString("utf8", nameIndex, nameEnd === -1 ? strTabBuf.length : nameEnd)

      if (name === SHA256_SIG_SECTION_NAME) {
        let secOffset: number
        let secSize: number

        if (is64) {
          secOffset = readUint64AsNumber(shTableBuf, entryOffset + 24, le)
          secSize = readUint64AsNumber(shTableBuf, entryOffset + 32, le)
        } else {
          secOffset = readUint32(shTableBuf, entryOffset + 16, le)
          secSize = readUint32(shTableBuf, entryOffset + 20, le)
        }

        return { offset: secOffset, size: secSize }
      }
    }

    return null
  } finally {
    try {
      await fs.close(fd)
    } catch {
      // ignore close errors
    }
  }
}

/**
 * Zeroes the bytes in the given section. The file descriptor must be opened with "r+" mode.
 */
export async function zeroSigSection(fd: number, section: ElfSection): Promise<void> {
  const zeroBuf = Buffer.alloc(section.size, 0)
  await fs.write(fd, zeroBuf, 0, zeroBuf.length, section.offset)
}

/**
 * Writes a GPG signature into the given section. Throws if the signature is larger than the section.
 * The file descriptor must be opened with "r+" mode.
 */
export async function writeSigSection(fd: number, section: ElfSection, signature: Buffer): Promise<void> {
  if (signature.length > section.size) {
    throw new Error(`GPG signature (${signature.length} bytes) exceeds .sha256_sig section size (${section.size} bytes)`)
  }
  // Zero-pad to fill the full section
  const padded = Buffer.alloc(section.size, 0)
  signature.copy(padded)
  await fs.write(fd, padded, 0, padded.length, section.offset)
}
