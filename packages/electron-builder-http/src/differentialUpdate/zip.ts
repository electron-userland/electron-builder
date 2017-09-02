export const eocdrWithoutCommentSize = 22

export function readCentralDirectoryEntry(buffer: Buffer): ZipFileReader {
  for (let i = buffer.length - eocdrWithoutCommentSize; i >= 0; i--) {
    if (buffer.readUInt32LE(i) !== 0x06054b50) {
      continue
    }

    // found eocdr
    const eocdrBuffer = buffer.slice(i)

    // 0 - End of central directory signature = 0x06054b50
    // 4 - Number of this disk
    const diskNumber = eocdrBuffer.readUInt16LE(4)
    if (diskNumber !== 0) {
      throw new Error(`Multi-disk zip files are not supported: found disk number: ${diskNumber}`)
    }

    // 6 - Disk where central directory starts
    // 8 - Number of central directory records on this disk
    // 10 - Total number of central directory records
    const entryCount = eocdrBuffer.readUInt16LE(10)
    // 12 - Size of central directory (bytes)
    const centralDirectorySize = eocdrBuffer.readUInt32LE(12)
    // 16 - Offset of start of central directory, relative to start of archive
    const centralDirectoryOffset = eocdrBuffer.readUInt32LE(16)

    const commentLength = eocdrBuffer.readUInt16LE(20)
    if (commentLength > 0) {
      throw new Error(`Zip file must not have comment (commentLength: ${commentLength})`)
    }

    return new ZipFileReader(centralDirectoryOffset, centralDirectorySize, entryCount)
  }

  throw new Error("end of central directory record signature not found")
}

export class ZipFileReader {
  private readEntryCursor = 0

  constructor(readonly centralDirectoryOffset: number, readonly centralDirectorySize: number, readonly entryCount: number) {
  }

  readEntries(buffer: Buffer) {
    this.readEntryCursor = 0

    const entries = new Array<Entry>(this.entryCount)
    for (let i = 0; i < this.entryCount; i++) {
      entries[i] = this.readEntry(buffer)
    }
    return entries
  }

  readEntry(buffer: Buffer): Entry {
    const entry = new Entry()
    // 0 - Central directory file header signature
    const signature = buffer.readUInt32LE(this.readEntryCursor)
    if (signature !== 0x02014b50) {
      throw new Error(`invalid central directory file header signature: 0x${signature.toString(16)}`)
    }

    // 4 - Version made by
    entry.versionMadeBy = buffer.readUInt16LE(this.readEntryCursor + 4)
    // 6 - Version needed to extract (minimum)
    entry.versionNeededToExtract = buffer.readUInt16LE(this.readEntryCursor + 6)
    // 8 - General purpose bit flag
    const generalPurposeBitFlag = buffer.readUInt16LE(this.readEntryCursor + 8)
    // 10 - Compression method
    entry.compressionMethod = buffer.readUInt16LE(this.readEntryCursor + 10)
    // 12 - File last modification time
    entry.lastModFileTime = buffer.readUInt16LE(this.readEntryCursor + 12)
    // 14 - File last modification date
    entry.lastModFileDate = buffer.readUInt16LE(this.readEntryCursor + 14)
    // 16 - CRC-32
    entry.crc32 = buffer.readUInt32LE(this.readEntryCursor + 16)
    // 20 - Compressed size
    entry.compressedSize = buffer.readUInt32LE(this.readEntryCursor + 20)
    // 24 - Uncompressed size
    entry.uncompressedSize = buffer.readUInt32LE(this.readEntryCursor + 24)
    // 28 - File name length (n)
    entry.fileNameLength = buffer.readUInt16LE(this.readEntryCursor + 28)

    // 30 - Extra field length (m)
    const extraFieldLength = buffer.readUInt16LE(this.readEntryCursor + 30)
    if (extraFieldLength > 0) {
      throw new Error("Must be no extra fields")
    }

    // 32 - File comment length (k)
    const fileCommentLength = buffer.readUInt16LE(this.readEntryCursor + 32)
    if (fileCommentLength > 0) {
      throw new Error("Must be no file comment")
    }

    // 34 - Disk number where file starts
    // 36 - Internal file attributes
    entry.internalFileAttributes = buffer.readUInt16LE(this.readEntryCursor + 36)
    // 38 - External file attributes
    entry.externalFileAttributes = buffer.readUInt32LE(this.readEntryCursor + 38)
    // 42 - Relative offset of local file header
    entry.offset = buffer.readUInt32LE(this.readEntryCursor + 42)

    if (generalPurposeBitFlag & 0x40) {
      throw new Error("strong encryption is not supported")
    }

    this.readEntryCursor += 46
    const entryDataSize = entry.fileNameLength
    buffer = buffer.slice(this.readEntryCursor, this.readEntryCursor + entryDataSize)
    this.readEntryCursor += entryDataSize

    // 46 - File name
    const isUtf8 = (generalPurposeBitFlag & 0x800) !== 0
    entry.fileName = decodeBuffer(buffer, 0, entry.fileNameLength, isUtf8)

    entry.dataStart = entry.offset + 30 + entry.fileNameLength
    return entry
  }
}

export class Entry {
  offset: number
  dataStart: number

  get dataEnd() {
    return this.dataStart + this.compressedSize
  }

  compressionMethod: number
  lastModFileDate: number
  lastModFileTime: number

  versionMadeBy: number
  versionNeededToExtract: number
  crc32: number

  fileName: string
  compressedSize: number
  uncompressedSize: number
  fileNameLength: number

  internalFileAttributes: number
  externalFileAttributes: number
}

const cp437 = '\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '

function decodeBuffer(buffer: Buffer, start: number, end: number, isUtf8: boolean) {
  if (isUtf8) {
    return buffer.toString("utf8", start, end)
  }

  let result = ""
  for (let i = start; i < end; i++) {
    result += cp437[buffer[i]]
  }
  return result
}
