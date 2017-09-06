import { EventEmitter } from "events"
import { close as closeFile, fstat, open, read } from "fs-extra-p"
import { Entry, eocdrWithoutCommentSize, readCentralDirectoryEntry, ZipFileReader } from "./zip"

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
  if (totalSize > Number.MAX_SAFE_INTEGER) {
    throw new Error("zip file too large. only file sizes up to 2^52 are supported due to JavaScript's Number type being an IEEE 754 double.")
  }

  // eocdr means End of Central Directory Record.
  // search backwards for the eocdr signature.
  // the last field of the eocdr is a variable-length comment.
  // the comment size is encoded in a 2-byte field in the eocdr, which we can't find without trudging backwards through the comment to find it.
  // as a consequence of this design decision, it's possible to have ambiguous zip file metadata if a coherent eocdr was in the comment.
  // we search backwards for a eocdr signature, and hope that whoever made the zip file was smart enough to forbid the eocdr signature in the comment.
   // 2-byte size
  const bufferSize = Math.min(eocdrWithoutCommentSize + 65535, totalSize)
  const buffer = Buffer.allocUnsafe(bufferSize)
  const bufferReadStart = totalSize - bufferSize

  await readAndAssertNoEof(fd, buffer, 0, bufferSize, bufferReadStart)
  const zipFileReader = readCentralDirectoryEntry(buffer)
  return new ZipFile(fd, zipFileReader, totalSize, options)
}

export class ZipFile extends EventEmitter {
  private isOpen = true

  // noinspection JSUnusedGlobalSymbols
  constructor(readonly fd: number, readonly zipReader: ZipFileReader, readonly fileSize: number, readonly options: ZipOptions) {
    super()
  }

  async readEntries(): Promise<Array<Entry>> {
    const buffer = Buffer.allocUnsafe(this.zipReader.centralDirectorySize)
    await readAndAssertNoEof(this.fd, buffer, 0, buffer.length, this.zipReader.centralDirectoryOffset)
    return this.zipReader.readEntries(buffer)
  }

  async close() {
    if (!this.isOpen) {
      return
    }

    this.isOpen = false
    return closeFile(this.fd)
  }

  async readEntryData(entry: Entry) {
    const buffer = Buffer.allocUnsafe(entry.compressedSize)
    await read(this.fd, buffer, 0, entry.compressedSize, entry.dataStart)
    return buffer
  }
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