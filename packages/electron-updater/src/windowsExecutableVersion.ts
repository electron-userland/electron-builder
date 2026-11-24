import { open } from "fs/promises"
import type { FileHandle } from "fs/promises"

// Reads the ProductVersion strings of the version resource of a Windows executable (PE): what electron-builder writes for an NSIS
// installer with `VIAddVersionKey ProductVersion` (the app version) and what Windows shows as the product version. Only the PE headers
// and the resource section are read, never the rest of the file (an NSIS installer carries its data after the sections).

// RT_VERSION
const VERSION_RESOURCE_TYPE = 16
// the resource directory entry of the optional header's data directories
const RESOURCE_DATA_DIRECTORY = 2
// the resource section of an NSIS installer (icons, manifest, dialogs, version) is far smaller
const MAX_RESOURCE_SECTION_SIZE = 16 * 1024 * 1024
// an NSIS installer has one version resource per language, a few at most
const MAX_VERSION_RESOURCES = 64

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, position)
  if (bytesRead !== length) {
    throw new Error(`unexpected end of file at offset ${position}`)
  }
  return buffer
}

/**
 * The ProductVersion strings of every string table in the version resources of the Windows executable `file`, in file order: empty when it
 * has no version resource or no ProductVersion. Throws when the file is no PE executable or its resources cannot be read.
 * @internal
 */
export async function readExecutableProductVersions(file: string): Promise<Array<string>> {
  const handle = await open(file, "r")
  try {
    const resources = await readResourceSection(handle)
    return resources == null ? [] : readVersionResources(resources)
  } finally {
    await handle.close()
  }
}

interface ResourceSection {
  readonly data: Buffer
  // the address (RVA) of the section, and of the resource directory in it
  readonly sectionStart: number
  readonly resourceRva: number
}

// the section that holds the resource directory, located through the DOS header, the PE headers and the section table; null without one
async function readResourceSection(handle: FileHandle): Promise<ResourceSection | null> {
  const dosHeader = await readAt(handle, 0, 64)
  if (dosHeader.readUInt16LE(0) !== 0x5a4d) {
    throw new Error("no MZ signature")
  }
  const peOffset = dosHeader.readUInt32LE(0x3c)
  // the PE signature, the file header and the magic of the optional header
  const fileHeader = await readAt(handle, peOffset, 26)
  if (fileHeader.readUInt32LE(0) !== 0x00004550) {
    throw new Error("no PE signature")
  }
  const numberOfSections = fileHeader.readUInt16LE(6)
  const sizeOfOptionalHeader = fileHeader.readUInt16LE(20)
  // PE32 or PE32+: the offset of NumberOfRvaAndSizes, followed by the data directories
  const magic = fileHeader.readUInt16LE(24)
  const directoriesCountOffset = magic === 0x10b ? 92 : magic === 0x20b ? 108 : -1
  if (directoriesCountOffset === -1) {
    throw new Error(`unknown optional header magic 0x${magic.toString(16)}`)
  }
  const resourceDirectoryOffset = directoriesCountOffset + 4 + RESOURCE_DATA_DIRECTORY * 8
  if (sizeOfOptionalHeader < resourceDirectoryOffset + 8) {
    throw new Error(`the optional header has ${sizeOfOptionalHeader} bytes, too few for the resource directory entry`)
  }
  const optionalHeader = await readAt(handle, peOffset + 24, sizeOfOptionalHeader)
  if (optionalHeader.readUInt32LE(directoriesCountOffset) <= RESOURCE_DATA_DIRECTORY) {
    return null
  }
  const resourceRva = optionalHeader.readUInt32LE(resourceDirectoryOffset)
  if (resourceRva === 0) {
    return null
  }

  const sectionTable = await readAt(handle, peOffset + 24 + sizeOfOptionalHeader, numberOfSections * 40)
  for (let entry = 0; entry < sectionTable.length; entry += 40) {
    const virtualSize = sectionTable.readUInt32LE(entry + 8)
    const sectionStart = sectionTable.readUInt32LE(entry + 12)
    const rawSize = sectionTable.readUInt32LE(entry + 16)
    if (resourceRva < sectionStart || resourceRva >= sectionStart + Math.max(virtualSize, rawSize)) {
      continue
    }
    if (rawSize > MAX_RESOURCE_SECTION_SIZE) {
      throw new Error(`the resource section has ${rawSize} bytes`)
    }
    return { data: await readAt(handle, sectionTable.readUInt32LE(entry + 20), rawSize), sectionStart, resourceRva }
  }
  throw new Error("the resource directory is in no section")
}

// the ProductVersion values of the RT_VERSION resources, walking the three directory levels: type, name and language
function readVersionResources({ data, sectionStart, resourceRva }: ResourceSection): Array<string> {
  // a resource address (RVA) as an offset in `data`
  const offsetOf = (rva: number, length: number): number => {
    const offset = rva - sectionStart
    if (offset < 0 || offset + length > data.length) {
      throw new Error(`resource address 0x${rva.toString(16)} is outside the resource section`)
    }
    return offset
  }

  // a directory is read once: a crafted directory tree that reuses (or contains) a directory would otherwise be walked again and again
  const visited = new Set<number>()
  // the data offsets of the entries of a resource directory at `directory` (an offset from the resource root), with their ids
  const entriesOf = (directory: number): Array<[number, number]> => {
    if (visited.has(directory)) {
      throw new Error(`the resource directory at 0x${directory.toString(16)} is referenced more than once`)
    }
    visited.add(directory)
    const header = offsetOf(resourceRva + directory, 16)
    const count = data.readUInt16LE(header + 12) + data.readUInt16LE(header + 14)
    offsetOf(resourceRva + directory + 16, count * 8)
    const entries: Array<[number, number]> = []
    for (let i = 0; i < count; i++) {
      const entry = header + 16 + i * 8
      entries.push([data.readUInt32LE(entry), data.readUInt32LE(entry + 4)])
    }
    return entries
  }
  // the data offset of a subdirectory has its high bit set, the one of a data entry has not (any other value is outside the resource section)
  const subdirectory = (dataOffset: number): number => dataOffset & 0x7fffffff

  const versions: Array<string> = []
  let resourceCount = 0
  for (const [, typeOffset] of entriesOf(0).filter(([type]) => type === VERSION_RESOURCE_TYPE)) {
    for (const [, nameOffset] of entriesOf(subdirectory(typeOffset))) {
      for (const [, languageOffset] of entriesOf(subdirectory(nameOffset))) {
        if (++resourceCount > MAX_VERSION_RESOURCES) {
          throw new Error(`the executable has more than ${MAX_VERSION_RESOURCES} version resources`)
        }
        const dataEntry = offsetOf(resourceRva + languageOffset, 16)
        const size = data.readUInt32LE(dataEntry + 4)
        const start = offsetOf(data.readUInt32LE(dataEntry), size)
        versions.push(...readProductVersions(data.subarray(start, start + size)))
      }
    }
  }
  return versions
}

interface Block {
  readonly key: string
  // wValueLength: bytes for a binary value, not reliably characters or bytes for a string
  readonly valueLength: number
  // the offset of the value, and the end of the block, in the version resource
  readonly valueOffset: number
  readonly end: number
}

// a VS_VERSIONINFO, StringFileInfo, StringTable or String block at `offset`, which is aligned to 32 bits (as are its value and children)
function readBlock(resource: Buffer, offset: number, parentEnd: number): Block {
  const length = resource.readUInt16LE(offset)
  const end = offset + length
  if (length < 6 || end > parentEnd) {
    throw new Error("a version resource block has an invalid length")
  }
  let keyEnd = offset + 6
  while (keyEnd + 1 < end && resource.readUInt16LE(keyEnd) !== 0) {
    keyEnd += 2
  }
  return { key: resource.toString("utf16le", offset + 6, keyEnd), valueLength: resource.readUInt16LE(offset + 2), valueOffset: align(keyEnd + 2), end }
}

function align(offset: number): number {
  return (offset + 3) & ~3
}

// the blocks that follow the value of `parent`, whose value has `valueLength` bytes
function childrenOf(resource: Buffer, parent: Block, valueLength: number): Array<Block> {
  const children: Array<Block> = []
  for (let offset = align(parent.valueOffset + valueLength); offset < parent.end;) {
    const child = readBlock(resource, offset, parent.end)
    children.push(child)
    offset = align(child.end)
  }
  return children
}

// the ProductVersion values of every string table of a VS_VERSIONINFO resource
function readProductVersions(resource: Buffer): Array<string> {
  const root = readBlock(resource, 0, resource.length)
  if (root.key !== "VS_VERSION_INFO") {
    throw new Error("the version resource is no VS_VERSIONINFO")
  }
  // the value of the root is the binary VS_FIXEDFILEINFO
  const versions: Array<string> = []
  for (const fileInfo of childrenOf(resource, root, root.valueLength)) {
    if (fileInfo.key !== "StringFileInfo") {
      continue
    }
    for (const table of childrenOf(resource, fileInfo, 0)) {
      for (const entry of childrenOf(resource, table, 0)) {
        if (entry.key === "ProductVersion") {
          // the value runs to its terminating NUL or the end of the block (see valueLength)
          versions.push(resource.toString("utf16le", entry.valueOffset, entry.end).split("\0", 1)[0])
        }
      }
    }
  }
  return versions
}
