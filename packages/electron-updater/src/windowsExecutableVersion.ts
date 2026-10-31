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

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, position)
  if (bytesRead !== length) {
    throw new Error(`unexpected end of file at offset ${position}`)
  }
  return buffer
}

interface Section {
  readonly virtualAddress: number
  readonly virtualSize: number
  readonly rawSize: number
  readonly rawPointer: number
}

/**
 * The ProductVersion strings of every string table in the version resources of the Windows executable `file`, in file order: empty when it
 * has no version resource or no ProductVersion. Throws when the file is no PE executable or its resources cannot be read.
 * @internal
 */
export async function readExecutableProductVersions(file: string): Promise<Array<string>> {
  const handle = await open(file, "r")
  try {
    const dosHeader = await readAt(handle, 0, 64)
    if (dosHeader.readUInt16LE(0) !== 0x5a4d) {
      throw new Error("no MZ signature")
    }
    const peOffset = dosHeader.readUInt32LE(0x3c)
    const fileHeader = await readAt(handle, peOffset, 24)
    if (fileHeader.readUInt32LE(0) !== 0x00004550) {
      throw new Error("no PE signature")
    }
    const numberOfSections = fileHeader.readUInt16LE(6)
    const sizeOfOptionalHeader = fileHeader.readUInt16LE(20)
    const optionalHeader = await readAt(handle, peOffset + 24, sizeOfOptionalHeader)
    // PE32 or PE32+: the offset of NumberOfRvaAndSizes, followed by the data directories
    const magic = optionalHeader.readUInt16LE(0)
    const directoriesCountOffset = magic === 0x10b ? 92 : magic === 0x20b ? 108 : -1
    if (directoriesCountOffset === -1) {
      throw new Error(`unknown optional header magic 0x${magic.toString(16)}`)
    }
    if (optionalHeader.readUInt32LE(directoriesCountOffset) <= RESOURCE_DATA_DIRECTORY) {
      return []
    }
    const resourceDirectoryOffset = directoriesCountOffset + 4 + RESOURCE_DATA_DIRECTORY * 8
    const resourceRva = optionalHeader.readUInt32LE(resourceDirectoryOffset)
    if (resourceRva === 0) {
      return []
    }

    const sectionTable = await readAt(handle, peOffset + 24 + sizeOfOptionalHeader, numberOfSections * 40)
    let section: Section | null = null
    for (let i = 0; i < numberOfSections; i++) {
      const entry = i * 40
      const candidate: Section = {
        virtualSize: sectionTable.readUInt32LE(entry + 8),
        virtualAddress: sectionTable.readUInt32LE(entry + 12),
        rawSize: sectionTable.readUInt32LE(entry + 16),
        rawPointer: sectionTable.readUInt32LE(entry + 20),
      }
      if (resourceRva >= candidate.virtualAddress && resourceRva < candidate.virtualAddress + Math.max(candidate.virtualSize, candidate.rawSize)) {
        section = candidate
        break
      }
    }
    if (section == null) {
      throw new Error("the resource directory is in no section")
    }
    if (section.rawSize > MAX_RESOURCE_SECTION_SIZE) {
      throw new Error(`the resource section has ${section.rawSize} bytes`)
    }
    const data = await readAt(handle, section.rawPointer, section.rawSize)
    const sectionStart = section.virtualAddress
    // a resource address (RVA) as an offset in `data`
    const offsetOf = (rva: number, length: number): number => {
      const offset = rva - sectionStart
      if (offset < 0 || offset + length > data.length) {
        throw new Error(`resource address 0x${rva.toString(16)} is outside the resource section`)
      }
      return offset
    }

    // the entries of a resource directory at `directory` (an offset from the resource root), each [id or name, data offset]
    const entriesOf = (directory: number): Array<[number, number]> => {
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
    // the three directory levels are type, name and language: the data offset of a subdirectory has its high bit set, the one of a data
    // entry has not (any other value is outside the resource section)
    const subdirectory = (dataOffset: number): number => dataOffset & 0x7fffffff

    const versions: Array<string> = []
    for (const [type, typeOffset] of entriesOf(0)) {
      if (type !== VERSION_RESOURCE_TYPE) {
        continue
      }
      for (const [, nameOffset] of entriesOf(subdirectory(typeOffset))) {
        for (const [, languageOffset] of entriesOf(subdirectory(nameOffset))) {
          const dataEntry = offsetOf(resourceRva + languageOffset, 16)
          const size = data.readUInt32LE(dataEntry + 4)
          const start = offsetOf(data.readUInt32LE(dataEntry), size)
          versions.push(...readProductVersions(data.subarray(start, start + size)))
        }
      }
    }
    return versions
  } finally {
    await handle.close()
  }
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
