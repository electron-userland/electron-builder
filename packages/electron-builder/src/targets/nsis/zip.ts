import { EventEmitter } from "events"
import { close as closeFile, fstat, open, read } from "fs-extra-p"

// promisified and optimized version of yauzl (read Central Directory Entry buffer in one read call)

export interface ZipOptions {
  decodeStrings?: boolean
  validateEntrySizes?: boolean

  ignoreComments?: boolean
}

export async function openZip(file: string, options?: ZipOptions | null): Promise<ZipFile> {
  const finalOptions: ZipOptions = {
    ignoreComments: true,
    validateEntrySizes: true,
    decodeStrings: true,
    ...options,
  }

  const fd = await open(file, "r")
  try {
    const stats = await fstat(fd)
    return await readEndOfCentralDirectoryRecord(fd, stats.size, finalOptions)
  }
  catch (e) {
    await closeFile(fd)
    throw e
  }
}

async function readEndOfCentralDirectoryRecord(fd: number, totalSize: number, options: ZipOptions) {
  const decodeStrings = options.decodeStrings
  if (totalSize > Number.MAX_SAFE_INTEGER) {
    throw new Error("zip file too large. only file sizes up to 2^52 are supported due to JavaScript's Number type being an IEEE 754 double.")
  }

  // eocdr means End of Central Directory Record.
  // search backwards for the eocdr signature.
  // the last field of the eocdr is a variable-length comment.
  // the comment size is encoded in a 2-byte field in the eocdr, which we can't find without trudging backwards through the comment to find it.
  // as a consequence of this design decision, it's possible to have ambiguous zip file metadata if a coherent eocdr was in the comment.
  // we search backwards for a eocdr signature, and hope that whoever made the zip file was smart enough to forbid the eocdr signature in the comment.
  const eocdrWithoutCommentSize = 22
  const maxCommentSize = 0xffff // 2-byte size
  const bufferSize = Math.min(eocdrWithoutCommentSize + maxCommentSize, totalSize)
  const buffer = Buffer.allocUnsafe(bufferSize)
  const bufferReadStart = totalSize - buffer.length

  await readAndAssertNoEof(fd, buffer, 0, bufferSize, bufferReadStart)
  for (let i = bufferSize - eocdrWithoutCommentSize; i >= 0; i--) {
    if (buffer.readUInt32LE(i) !== 0x06054b50) {
      continue
    }

    // found eocdr
    const eocdrBuffer = buffer.slice(i)

    // 0 - End of central directory signature = 0x06054b50
    // 4 - Number of this disk
    const diskNumber = eocdrBuffer.readUInt16LE(4)
    if (diskNumber !== 0) {
      throw new Error(`multi-disk zip files are not supported: found disk number: ${diskNumber}`)
    }

    // 6 - Disk where central directory starts
    // 8 - Number of central directory records on this disk
    // 10 - Total number of central directory records
    let entryCount = eocdrBuffer.readUInt16LE(10)
    // 12 - Size of central directory (bytes)
    const centralDirectorySize = eocdrBuffer.readUInt32LE(12)
    // 16 - Offset of start of central directory, relative to start of archive
    let centralDirectoryOffset = eocdrBuffer.readUInt32LE(16)
    // 20 - Comment length
    const commentLength = eocdrBuffer.readUInt16LE(20)
    const expectedCommentLength = eocdrBuffer.length - eocdrWithoutCommentSize
    if (commentLength !== expectedCommentLength) {
      throw new Error(`invalid comment length. expected: ${expectedCommentLength}. found: ${commentLength}`)
    }
    // 22 - Comment
    // the encoding is always cp437.
    const comment = options.ignoreComments ? "" : (decodeStrings ? decodeBuffer(eocdrBuffer, 22, eocdrBuffer.length, false) : eocdrBuffer.slice(22))

    if (!(entryCount === 0xffff || centralDirectoryOffset === 0xffffffff)) {
      return new ZipFile(fd, centralDirectorySize, centralDirectoryOffset, totalSize, entryCount, comment, options)
    }

    // ZIP64 format

    // ZIP64 Zip64 end of central directory locator
    const zip64EocdlBuffer = Buffer.allocUnsafe(20)
    const zip64EocdlOffset = bufferReadStart + i - zip64EocdlBuffer.length
    await readAndAssertNoEof(fd, zip64EocdlBuffer, 0, zip64EocdlBuffer.length, zip64EocdlOffset)

    // 0 - zip64 end of central dir locator signature = 0x07064b50
    if (zip64EocdlBuffer.readUInt32LE(0) !== 0x07064b50) {
      throw new Error("invalid zip64 end of central directory locator signature")
    }

    // 4 - number of the disk with the start of the zip64 end of central directory
    // 8 - relative offset of the zip64 end of central directory record
    const zip64EocdrOffset = readUInt64LE(zip64EocdlBuffer, 8)
    // 16 - total number of disks

    // ZIP64 end of central directory record
    const zip64EocdrBuffer = Buffer.allocUnsafe(56)
    await readAndAssertNoEof(fd, zip64EocdrBuffer, 0, zip64EocdrBuffer.length, zip64EocdrOffset)
    // 0 - zip64 end of central dir signature                           4 bytes  (0x06064b50)
    if (zip64EocdrBuffer.readUInt32LE(0) !== 0x06064b50) {
      throw new Error("invalid zip64 end of central directory record signature")
    }
    // 4 - size of zip64 end of central directory record                8 bytes
    // 12 - version made by                                             2 bytes
    // 14 - version needed to extract                                   2 bytes
    // 16 - number of this disk                                         4 bytes
    // 20 - number of the disk with the start of the central directory  4 bytes
    // 24 - total number of entries in the central directory on this disk         8 bytes
    // 32 - total number of entries in the central directory            8 bytes
    entryCount = readUInt64LE(zip64EocdrBuffer, 32)
    // 40 - size of the central directory                               8 bytes
    // 48 - offset of start of central directory with respect to the starting disk number     8 bytes
    centralDirectoryOffset = readUInt64LE(zip64EocdrBuffer, 48)
    // 56 - zip64 extensible data sector                                (variable size)
    return new ZipFile(fd, readUInt64LE(zip64EocdrBuffer, 40), centralDirectoryOffset, totalSize, entryCount, comment, options)
  }

  throw new Error("end of central directory record signature not found")
}

export class ZipFile extends EventEmitter {
  private readEntryCursor = 0
  private isOpen = true

  // noinspection JSUnusedGlobalSymbols
  constructor(readonly fd: number, readonly centralDirectorySize: number, readonly centralDirectoryOffset: number, readonly fileSize: number, readonly entryCount: number, readonly comment: any, readonly options: ZipOptions) {
    super()
  }

  async readEntries() {
    this.readEntryCursor = 0
    const buffer = Buffer.allocUnsafe(this.centralDirectorySize)
    await readAndAssertNoEof(this.fd, buffer, 0, buffer.length, this.centralDirectoryOffset)

    const entries = new Array<Entry>(this.entryCount)
    for (let i = 0; i < this.entryCount; i++) {
      entries[i] = this.readEntry(buffer)
    }
    return entries
  }

  async close() {
    if (!this.isOpen) {
      return
    }

    this.isOpen = false
    return closeFile(this.fd)
  }

  private readEntry(buffer: Buffer): Entry {
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
    entry.generalPurposeBitFlag = buffer.readUInt16LE(this.readEntryCursor + 8)
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
    entry.extraFieldLength = buffer.readUInt16LE(this.readEntryCursor + 30)
    // 32 - File comment length (k)
    entry.fileCommentLength = buffer.readUInt16LE(this.readEntryCursor + 32)
    // 34 - Disk number where file starts
    // 36 - Internal file attributes
    entry.internalFileAttributes = buffer.readUInt16LE(this.readEntryCursor + 36)
    // 38 - External file attributes
    entry.externalFileAttributes = buffer.readUInt32LE(this.readEntryCursor + 38)
    // 42 - Relative offset of local file header
    entry.relativeOffsetOfLocalHeader = buffer.readUInt32LE(this.readEntryCursor + 42)

    if (entry.generalPurposeBitFlag & 0x40) {
      throw new Error("strong encryption is not supported")
    }

    this.readEntryCursor += 46
    const entryDataSize = entry.fileNameLength + entry.extraFieldLength + entry.fileCommentLength
    buffer = buffer.slice(this.readEntryCursor, this.readEntryCursor + entryDataSize)
    this.readEntryCursor += entryDataSize

    // 46 - File name
    const isUtf8 = (entry.generalPurposeBitFlag & 0x800) !== 0
    entry.fileName = this.options.decodeStrings ? decodeBuffer(buffer, 0, entry.fileNameLength, isUtf8) : buffer.slice(0, entry.fileNameLength)

    // 46+n - Extra field
    const fileCommentStart = entry.fileNameLength + entry.extraFieldLength
    readExtraFields(buffer.slice(entry.fileNameLength, fileCommentStart), entry)

    // 46+n+m - File comment
    if (!this.options.ignoreComments) {
      if (this.options.decodeStrings) {
        entry.fileComment = decodeBuffer(buffer, fileCommentStart, fileCommentStart + entry.fileCommentLength, isUtf8)
      }
      else {
        entry.fileComment = buffer.slice(fileCommentStart, fileCommentStart + entry.fileCommentLength)
      }
    }

    readZip64Entry(entry)

    // check for Info-ZIP Unicode Path Extra Field (0x7075)
    // see https://github.com/thejoshwolfe/yauzl/issues/33
    if (this.options.decodeStrings) {
      for (const extraField of entry.extraFields) {
        if (extraField.id === 0x7075) {
          if (extraField.data.length < 6) {
            // too short to be meaningful
            continue
          }
          // Version       1 byte      version of this extra field, currently 1
          if (extraField.data.readUInt8(0) !== 1) {
            // > Changes may not be backward compatible so this extra
            // > field should not be used if the version is not recognized.
            continue
          }
          // NameCRC32     4 bytes     File Name Field CRC32 Checksum
          // const oldNameCrc32 = extraField.data.readUInt32LE(1)
          // if (crc32.unsigned(buffer.slice(0, entry.fileNameLength)) !== oldNameCrc32) {
          //   // > If the CRC check fails, this UTF-8 Path Extra Field should be
          //   // > ignored and the File Name field in the header should be used instead.
          //   continue
          // }
          // UnicodeName   Variable    UTF-8 version of the entry File Name
          entry.fileName = decodeBuffer(extraField.data, 5, extraField.data.length, true)
          break
        }
      }
    }

    // validate file size
    if (this.options.validateEntrySizes && entry.compressionMethod === 0) {
      let expectedCompressedSize = entry.uncompressedSize
      if (entry.isEncrypted) {
        // traditional encryption prefixes the file data with a header
        expectedCompressedSize += 12
      }
      if (entry.compressedSize !== expectedCompressedSize) {
        throw new Error("compressed/uncompressed size mismatch for stored file: " + entry.compressedSize + " != " + entry.uncompressedSize)
      }
    }

    if (this.options.decodeStrings) {
      const errorMessage = validateFileName(entry.fileName as string)
      if (errorMessage != null) {
        throw new Error(errorMessage)
      }
    }
    return entry
  }

  async getDataPosition(entry: Entry): Promise<EntryDataRange> {
    const buffer = Buffer.allocUnsafe(30)
    await readAndAssertNoEof(this.fd, buffer, 0, buffer.length, entry.relativeOffsetOfLocalHeader)
    // 0 - Local file header signature = 0x04034b50
    const signature = buffer.readUInt32LE(0)
    if (signature !== 0x04034b50) {
      throw new Error(`invalid local file header signature: 0x${signature.toString(16)}`)
    }

    // all this should be redundant
    // 4 - Version needed to extract (minimum)
    // 6 - General purpose bit flag
    // 8 - Compression method
    // 10 - File last modification time
    // 12 - File last modification date
    // 14 - CRC-32
    // 18 - Compressed size
    // 22 - Uncompressed size
    // 26 - File name length (n)
    const fileNameLength = buffer.readUInt16LE(26)
    // 28 - Extra field length (m)
    const extraFieldLength = buffer.readUInt16LE(28)
    // 30 - File name
    // 30+n - Extra field
    const fileDataStart = entry.relativeOffsetOfLocalHeader + buffer.length + fileNameLength + extraFieldLength
    const fileDataEnd = fileDataStart + entry.compressedSize
    if (entry.compressedSize !== 0) {
      // bounds check now, because the read streams will probably not complain loud enough.
      // since we're dealing with an unsigned offset plus an unsigned size, we only have 1 thing to check for.
      if (fileDataEnd > this.fileSize) {
        throw new Error(`file data overflows file bounds: ${fileDataStart} + ${entry.compressedSize} > ${this.fileSize}`)
      }
    }

    return {
      start: fileDataStart,
      end: fileDataStart + entry.compressedSize,
    }
  }
}

export interface EntryDataRange {
  start: number
  end: number
}

function readExtraFields(extraFieldBuffer: Buffer, entry: Entry) {
  entry.extraFields = []
  let i = 0
  while (i < extraFieldBuffer.length - 3) {
    const headerId = extraFieldBuffer.readUInt16LE(i)
    const dataSize = extraFieldBuffer.readUInt16LE(i + 2)
    const dataStart = i + 4
    const dataEnd = dataStart + dataSize
    if (dataEnd > extraFieldBuffer.length) {
      throw new Error("extra field length exceeds extra field buffer size")
    }
    const dataBuffer = Buffer.allocUnsafe(dataSize)
    extraFieldBuffer.copy(dataBuffer, 0, dataStart, dataEnd)
    entry.extraFields.push({
      id: headerId,
      data: dataBuffer,
    })
    i = dataEnd
  }
}

function readZip64Entry(entry: Entry) {
  if (entry.uncompressedSize === 0xffffffff ||
    entry.compressedSize === 0xffffffff ||
    entry.relativeOffsetOfLocalHeader === 0xffffffff) {
    // ZIP64 format
    // find the Zip64 Extended Information Extra Field
    let zip64EiefBuffer = null
    for (const extraField of entry.extraFields) {
      if (extraField.id === 0x0001) {
        zip64EiefBuffer = extraField.data
        break
      }
    }
    if (zip64EiefBuffer == null) {
      throw new Error("expected zip64 extended information extra field")
    }
    let index = 0
    // 0 - Original Size          8 bytes
    if (entry.uncompressedSize === 0xffffffff) {
      if (index + 8 > zip64EiefBuffer.length) {
        throw new Error("zip64 extended information extra field does not include uncompressed size")
      }
      entry.uncompressedSize = readUInt64LE(zip64EiefBuffer, index)
      index += 8
    }
    // 8 - Compressed Size        8 bytes
    if (entry.compressedSize === 0xffffffff) {
      if (index + 8 > zip64EiefBuffer.length) {
        throw new Error("zip64 extended information extra field does not include compressed size")
      }
      entry.compressedSize = readUInt64LE(zip64EiefBuffer, index)
      index += 8
    }
    // 16 - Relative Header Offset 8 bytes
    if (entry.relativeOffsetOfLocalHeader === 0xffffffff) {
      if (index + 8 > zip64EiefBuffer.length) {
        throw new Error("zip64 extended information extra field does not include relative header offset")
      }
      entry.relativeOffsetOfLocalHeader = readUInt64LE(zip64EiefBuffer, index)
      // noinspection JSUnusedAssignment
      index += 8
    }
    // 24 - Disk Start Number      4 bytes
  }
}

export class Entry {
  compressionMethod: number
  generalPurposeBitFlag: number
  lastModFileDate: number
  lastModFileTime: number

  versionMadeBy: number
  versionNeededToExtract: number
  crc32: number

  fileName: string | Buffer
  fileComment: string | Buffer
  compressedSize: number
  uncompressedSize: number
  fileNameLength: number
  extraFieldLength: number
  fileCommentLength: number
  internalFileAttributes: number
  externalFileAttributes: number
  relativeOffsetOfLocalHeader: number

  extraFields: Array<any>

  get isEncrypted() {
    return (this.generalPurposeBitFlag & 0x1) !== 0
  }
  get isCompressed() {
    return this.compressionMethod === 8
  }
}

function validateFileName(fileName: string) {
  if (fileName.indexOf("\\") !== -1) {
    return "invalid characters in fileName: " + fileName
  }
  if (/^[a-zA-Z]:/.test(fileName) || /^\//.test(fileName)) {
    return "absolute path: " + fileName
  }
  if (fileName.split("/").indexOf("..") !== -1) {
    return "invalid relative path: " + fileName
  }
  // all good
  return null
}

async function readAndAssertNoEof(fd: number, buffer: Buffer, offset: number, length: number, position: number) {
  if (length === 0) {
    // fs.read will throw an out-of-bounds error if you try to read 0 bytes from a 0 byte file
    return Buffer.alloc(0)
  }

  // noinspection UnnecessaryLocalVariableJS
  const result = await read(fd, buffer, offset, length, position)
  //   if (bytesRead < length) {
  //     return callback(new Error("unexpected EOF"))
  //   }
  return result
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

function readUInt64LE(buffer: Buffer, offset: number) {
  // there is no native function for this, because we can't actually store 64-bit integers precisely.
  // after 53 bits, JavaScript's Number type (IEEE 754 double) can't store individual integers anymore.
  // but since 53 bits is a whole lot more than 32 bits, we do our best anyway.
  const lower32 = buffer.readUInt32LE(offset)
  const upper32 = buffer.readUInt32LE(offset + 4)
  // we can't use bitshifting here, because JavaScript bitshifting only works on 32-bit integers.
  return upper32 * 0x100000000 + lower32
  // as long as we're bounds checking the result of this function against the total file size,
  // we'll catch any overflow errors, because we already made sure the total file size was within reason.
}