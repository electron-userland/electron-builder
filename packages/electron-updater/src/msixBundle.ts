import { newError } from "builder-util-runtime"
import { getPackageIdentity } from "builder-util-runtime/internal"
import { open } from "fs/promises"
import type { FileHandle } from "fs/promises"
import { promisify } from "util"
import { inflateRaw } from "zlib"

const inflateRawAsync = promisify(inflateRaw)

/** Where an `.msixbundle` (an OPC zip) keeps its manifest, whose `<Identity>` is the identity of the bundle. */
export const MSIX_BUNDLE_MANIFEST_ENTRY = "AppxMetadata/AppxBundleManifest.xml"

// a bundle manifest lists the packages of the bundle: far smaller than this
const MAX_ENTRY_SIZE = 16 * 1024 * 1024
// the end of central directory record, and the longest comment that may follow it
const EOCD_SIZE = 22
const MAX_EOCD_SEARCH = EOCD_SIZE + 0xffff
const ZIP64_LOCATOR_SIZE = 20
const ZIP64_EOCD_SIZE = 56
const CENTRAL_HEADER_SIZE = 46
const LOCAL_HEADER_SIZE = 30

/**
 * The identity (`Name`, `Publisher`, `Version`) of an `.msixbundle`, read from its bundle manifest.
 * @internal
 */
export async function readMsixBundleIdentity(file: string): Promise<{ name: string; publisher: string; version: string }> {
  const manifest = await readZipEntry(file, MSIX_BUNDLE_MANIFEST_ENTRY)
  if (manifest == null) {
    throw new Error(`no ${MSIX_BUNDLE_MANIFEST_ENTRY}`)
  }
  return getPackageIdentity(manifest.toString("utf8"))
}

/**
 * The content of one entry of a zip (Zip64 too), stored or deflated, matched case-insensitively like an OPC part name; `null` without it.
 * Reads the central directory and that entry only.
 * @internal
 */
export async function readZipEntry(file: string, entryName: string): Promise<Buffer | null> {
  const handle = await open(file, "r")
  try {
    const size = (await handle.stat()).size
    const directory = await readCentralDirectoryLocation(handle, size)
    if (directory.size > MAX_ENTRY_SIZE * 4 || directory.offset + directory.size > size) {
      throw new Error("invalid zip central directory")
    }
    const centralDirectory = await readAt(handle, directory.offset, directory.size)
    const entry = findEntry(centralDirectory, entryName.toLowerCase())
    if (entry == null) {
      return null
    }
    if (entry.uncompressedSize > MAX_ENTRY_SIZE || entry.compressedSize > MAX_ENTRY_SIZE) {
      throw new Error(`${entryName} is too large`)
    }

    const localHeader = await readAt(handle, entry.localHeaderOffset, LOCAL_HEADER_SIZE)
    if (localHeader.readUInt32LE(0) !== 0x04034b50) {
      throw new Error(`invalid local header of ${entryName}`)
    }
    const dataOffset = entry.localHeaderOffset + LOCAL_HEADER_SIZE + localHeader.readUInt16LE(26) + localHeader.readUInt16LE(28)
    const data = await readAt(handle, dataOffset, entry.compressedSize)
    let content: Buffer
    if (entry.method === 0) {
      content = data
    } else if (entry.method === 8) {
      content = await inflateRawAsync(data, { maxOutputLength: MAX_ENTRY_SIZE })
    } else {
      throw new Error(`${entryName} uses the unsupported compression method ${entry.method}`)
    }
    if (content.length !== entry.uncompressedSize) {
      throw new Error(`${entryName} has ${content.length} bytes instead of ${entry.uncompressedSize}`)
    }
    return content
  } finally {
    await handle.close()
  }
}

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  if (bytesRead !== length) {
    throw new Error("unexpected end of the zip file")
  }
  return buffer
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("zip offset out of range")
  }
  return Number(value)
}

async function readCentralDirectoryLocation(handle: FileHandle, size: number): Promise<{ offset: number; size: number }> {
  const tailLength = Math.min(size, MAX_EOCD_SEARCH)
  const tailStart = size - tailLength
  const tail = await readAt(handle, tailStart, tailLength)
  let eocd = -1
  for (let i = tailLength - EOCD_SIZE; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd === -1) {
    throw new Error("not a zip file")
  }

  // a Zip64 locator right before the end of central directory record points to the Zip64 record, which has the real values
  const eocdPosition = tailStart + eocd
  if (eocdPosition >= ZIP64_LOCATOR_SIZE) {
    const locator = await readAt(handle, eocdPosition - ZIP64_LOCATOR_SIZE, ZIP64_LOCATOR_SIZE)
    if (locator.readUInt32LE(0) === 0x07064b50) {
      const zip64Eocd = await readAt(handle, toSafeNumber(locator.readBigUInt64LE(8)), ZIP64_EOCD_SIZE)
      if (zip64Eocd.readUInt32LE(0) !== 0x06064b50) {
        throw new Error("invalid Zip64 end of central directory record")
      }
      return { size: toSafeNumber(zip64Eocd.readBigUInt64LE(40)), offset: toSafeNumber(zip64Eocd.readBigUInt64LE(48)) }
    }
  }
  return { size: tail.readUInt32LE(eocd + 12), offset: tail.readUInt32LE(eocd + 16) }
}

interface ZipEntry {
  readonly method: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly localHeaderOffset: number
}

function findEntry(centralDirectory: Buffer, lowerCaseName: string): ZipEntry | null {
  let position = 0
  while (position + CENTRAL_HEADER_SIZE <= centralDirectory.length) {
    if (centralDirectory.readUInt32LE(position) !== 0x02014b50) {
      throw new Error("invalid zip central directory entry")
    }
    const nameLength = centralDirectory.readUInt16LE(position + 28)
    const extraLength = centralDirectory.readUInt16LE(position + 30)
    const commentLength = centralDirectory.readUInt16LE(position + 32)
    const nameStart = position + CENTRAL_HEADER_SIZE
    const extraStart = nameStart + nameLength
    const next = extraStart + extraLength + commentLength
    if (next > centralDirectory.length) {
      throw new Error("invalid zip central directory entry")
    }
    if (centralDirectory.toString("utf8", nameStart, extraStart).toLowerCase() === lowerCaseName) {
      if ((centralDirectory.readUInt16LE(position + 8) & 1) !== 0) {
        throw new Error("encrypted zip entry")
      }
      return readEntry(centralDirectory, position, centralDirectory.subarray(extraStart, extraStart + extraLength))
    }
    position = next
  }
  return null
}

function readEntry(centralDirectory: Buffer, position: number, extra: Buffer): ZipEntry {
  let uncompressedSize = centralDirectory.readUInt32LE(position + 24)
  let compressedSize = centralDirectory.readUInt32LE(position + 20)
  let localHeaderOffset = centralDirectory.readUInt32LE(position + 42)
  // a value that does not fit is 0xFFFFFFFF, and the Zip64 extra field has it: in this order, and only the ones that do not fit
  if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
    let extraPosition = 0
    while (extraPosition + 4 <= extra.length && extra.readUInt16LE(extraPosition) !== 0x0001) {
      extraPosition += 4 + extra.readUInt16LE(extraPosition + 2)
    }
    if (extraPosition + 4 > extra.length) {
      throw new Error("missing Zip64 extra field")
    }
    let field = extraPosition + 4
    const next = (): number => {
      if (field + 8 > extra.length) {
        throw new Error("truncated Zip64 extra field")
      }
      const value = toSafeNumber(extra.readBigUInt64LE(field))
      field += 8
      return value
    }
    if (uncompressedSize === 0xffffffff) {
      uncompressedSize = next()
    }
    if (compressedSize === 0xffffffff) {
      compressedSize = next()
    }
    if (localHeaderOffset === 0xffffffff) {
      localHeaderOffset = next()
    }
  }
  return { method: centralDirectory.readUInt16LE(position + 10), compressedSize, uncompressedSize, localHeaderOffset }
}

/** Wraps a failure to read the bundle identity, so that the download is refused like any other invalid update file. */
export function newInvalidBundleError(file: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return newError(`The downloaded update ${file} is not a valid .msixbundle: cannot read its identity (${message})`, "ERR_UPDATER_INVALID_UPDATE_FILE")
}
