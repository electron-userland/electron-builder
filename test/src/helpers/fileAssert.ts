import { exists, statOrNull } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { ExpectStatic } from "vitest"
import { PACKAGE_VERSION as appVersion } from "app-builder-lib/internal"

// http://joel-costigliola.github.io/assertj/
export function assertThat(expect: ExpectStatic, actual: any): Assertions {
  return new Assertions(expect, actual)
}

class Assertions {
  constructor(
    private readonly expect: ExpectStatic,
    private actual: any
  ) {}

  containsAll<T>(expected: Iterable<T>) {
    this.expect(this.actual.slice().sort()).toEqual(Array.from(expected).slice().sort())
  }

  isAbsolute() {
    if (!path.isAbsolute(this.actual)) {
      throw new Error(`Path ${this.actual} is not absolute`)
    }
  }

  async isFile() {
    const info = await statOrNull(this.actual)
    if (info == null) {
      throw new Error(`Path ${this.actual} doesn't exist`)
    }
    if (!info.isFile()) {
      throw new Error(`Path ${this.actual} is not a file`)
    }
  }

  async isSymbolicLink() {
    const info = await fs.lstat(this.actual)
    if (!info.isSymbolicLink()) {
      throw new Error(`Path ${this.actual} is not a symlink`)
    }
  }

  async isDirectory() {
    const file = this.actual
    const info = await statOrNull(file)
    if (info == null) {
      throw new Error(`Path ${file} doesn't exist`)
    }
    if (!info.isDirectory()) {
      throw new Error(`Path ${file} is not a directory`)
    }
  }

  async doesNotExist() {
    if (await exists(this.actual)) {
      throw new Error(`Path ${this.actual} must not exist`)
    }
  }

  async throws(customErrorAssert?: (error: Error) => void) {
    let actualError: Error | null = null
    let result: any
    try {
      result = await this.actual
    } catch (e: any) {
      actualError = e
    }

    let m: any
    if (actualError == null) {
      m = result
    } else {
      m = (actualError as NodeJS.ErrnoException).code || actualError.message

      if (m.includes("HttpError: ") && m.indexOf("\n") > 0) {
        m = m.substring(0, m.indexOf("\n"))
      }

      if (m.startsWith("Cannot find specified resource")) {
        m = m.substring(0, m.indexOf(","))
      }

      m = m.replace(appVersion, "<appVersion>")
      m = m.replace(/\((C:)?([\/\\])[^(]+([\/\\])([^(\/\\]+)\)/g, `(<path>/$4)`)
      m = m.replace(/"(C:)?([\/\\])[^"]+([\/\\])([^"\/\\]+)"/g, `"<path>/$4"`)
      m = m.replace(/'(C:)?([\/\\])[^']+([\/\\])([^'\/\\]+)'/g, `'<path>/$4'`)
    }
    try {
      if (customErrorAssert == null) {
        this.expect(m).toMatchSnapshot()
      } else {
        customErrorAssert(actualError!)
      }
    } catch (matchError: any) {
      throw new Error(matchError + " " + actualError?.message)
    }
  }
}

// Squashfs superblock magic: "hsqs" in little-endian (https://dr-emann.github.io/squashfs/#superblock)
const SQUASHFS_MAGIC = 0x73717368

// Compression type field is a uint16 at superblock offset +20
// Values defined in the squashfs specification, section 4.1
const SQUASHFS_COMPRESSION: Record<number, string> = {
  1: "gzip",
  2: "lzma",
  3: "lzo",
  4: "xz",
  5: "lz4",
  6: "zstd",
}

/**
 * Reads the squashfs compression algorithm from an AppImage binary.
 *
 * An AppImage is `[ELF runtime][squashfs filesystem]`. The squashfs superblock
 * starts on a 4 KiB page boundary immediately after the last ELF LOAD segment.
 * This function parses the ELF program headers to find that boundary rather than
 * scanning from byte 0 (which can hit false-positive magic bytes inside the ELF
 * runtime), then reads the compression type from squashfs superblock offset +20.
 */
export async function readAppImageCompression(filePath: string): Promise<string> {
  const handle = await fs.open(filePath, "r")
  try {
    const squashfsOffset = await findSquashfsOffset(handle, filePath)
    const typeBuf = Buffer.allocUnsafe(2)
    await handle.read(typeBuf, 0, 2, squashfsOffset + 20)
    const type = typeBuf.readUInt16LE(0)
    return SQUASHFS_COMPRESSION[type] ?? `unknown(${type})`
  } finally {
    await handle.close()
  }
}

async function findSquashfsOffset(handle: fs.FileHandle, filePath: string): Promise<number> {
  const { size } = await handle.stat()

  // Read ELF identification block (first 16 bytes)
  const ident = Buffer.allocUnsafe(16)
  await handle.read(ident, 0, 16, 0)

  const isElf = ident[0] === 0x7f && ident[1] === 0x45 && ident[2] === 0x4c && ident[3] === 0x46
  if (!isElf) {
    return scanForSquashfsMagic(handle, 0, size, filePath)
  }

  const is64bit = ident[4] === 2 // EI_CLASS: 1 = 32-bit, 2 = 64-bit

  // Parse ELF header to find program header table location
  const hdrSize = is64bit ? 64 : 52
  const hdrBuf = Buffer.allocUnsafe(hdrSize)
  await handle.read(hdrBuf, 0, hdrSize, 0)

  let phoff: number, phentsize: number, phnum: number
  if (is64bit) {
    phoff = Number(hdrBuf.readBigUInt64LE(32))
    phentsize = hdrBuf.readUInt16LE(54)
    phnum = hdrBuf.readUInt16LE(56)
  } else {
    phoff = hdrBuf.readUInt32LE(28)
    phentsize = hdrBuf.readUInt16LE(42)
    phnum = hdrBuf.readUInt16LE(44)
  }

  // Find the file offset past the end of the last PT_LOAD segment
  const phTableBuf = Buffer.allocUnsafe(phentsize * phnum)
  await handle.read(phTableBuf, 0, phTableBuf.length, phoff)

  let endOfLastLoad = 0
  for (let i = 0; i < phnum; i++) {
    const ph = phTableBuf.subarray(i * phentsize)
    if (ph.readUInt32LE(0) !== 1 /* PT_LOAD */) {
      continue
    }
    let pOffset: number, pFilesz: number
    if (is64bit) {
      pOffset = Number(ph.readBigUInt64LE(8))
      pFilesz = Number(ph.readBigUInt64LE(32))
    } else {
      pOffset = ph.readUInt32LE(4)
      pFilesz = ph.readUInt32LE(16)
    }
    endOfLastLoad = Math.max(endOfLastLoad, pOffset + pFilesz)
  }

  // Squashfs is appended on a 4 KiB page boundary after the ELF segments
  const candidate = Math.ceil(endOfLastLoad / 4096) * 4096

  // Verify magic at the computed offset; narrow scan if misaligned
  const magicBuf = Buffer.allocUnsafe(4)
  await handle.read(magicBuf, 0, 4, candidate)
  if (magicBuf.readUInt32LE(0) === SQUASHFS_MAGIC) {
    return candidate
  }

  const scanStart = Math.max(0, candidate - 4096)
  const scanEnd = Math.min(size, candidate + 4096 * 4)
  return scanForSquashfsMagic(handle, scanStart, scanEnd, filePath)
}

async function scanForSquashfsMagic(handle: fs.FileHandle, start: number, end: number, filePath: string): Promise<number> {
  const chunkSize = 65536
  const buf = Buffer.allocUnsafe(chunkSize + 4)

  for (let pos = start; pos < end - 4; pos += chunkSize) {
    const toRead = Math.min(chunkSize + 4, end - pos)
    const { bytesRead } = await handle.read(buf, 0, toRead, pos)
    for (let i = 0; i <= bytesRead - 4; i++) {
      if (buf.readUInt32LE(i) === SQUASHFS_MAGIC) {
        return pos + i
      }
    }
  }
  throw new Error(`squashfs magic not found in ${filePath}`)
}
