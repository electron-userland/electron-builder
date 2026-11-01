import { InvalidConfigurationError, log } from "builder-util"
import chromiumPickleJs from "chromium-pickle-js"
import { createHash } from "crypto"
import fs from "fs-extra"
import { Node, readAsarHeader } from "./asar.js"

export interface AsarAlignmentResult {
  /** packed files whose content was re-laid */
  files: number
  /** total zero padding between files in the resulting layout */
  paddingBytes: number
  /** archive size before / after */
  sizeBefore: number
  sizeAfter: number
}

const COPY_CHUNK = 1024 * 1024

/** Above this alignment every file is padded up to a boundary that is likely much larger than the file itself. */
export const CONTENT_ALIGNMENT_WARN_THRESHOLD = 64 * 1024

/**
 * Validates an `asar.contentAlignment` value. Called from `computeAsarOptions` before packing starts and
 * again by `alignAsarContent` (which is public and used directly by the benchmark).
 */
export function validateContentAlignment(alignment: unknown): asserts alignment is number {
  if (typeof alignment !== "number" || !Number.isInteger(alignment) || alignment < 1) {
    throw new InvalidConfigurationError(`asar.contentAlignment must be a positive integer, got ${String(alignment)}`)
  }
}

interface PackedFile {
  node: Node
  /** path inside the archive, for messages */
  name: string
  offset: number
  size: number
}

function collectPackedFiles(node: Node, result: Array<PackedFile>, prefix = ""): void {
  const files = node.files
  if (files == null) {
    return
  }
  for (const [name, child] of Object.entries(files)) {
    if (child.files != null) {
      collectPackedFiles(child, result, `${prefix}${name}/`)
    } else if (child.offset != null && !child.unpacked && child.link == null) {
      result.push({ node: child, name: `${prefix}${name}`, offset: parseInt(child.offset, 10), size: child.size ?? 0 })
    }
  }
}

/**
 * The size an asar archive must have for its header: the 8-byte size prefix, the header, and the end of the last packed file.
 * Packed content is read at `8 + header size + offset` (https://github.com/electron/asar/blob/fde819a/src/disk.ts#L428).
 */
export function expectedArchiveSize(header: Node, headerSize: number): number {
  const files: Array<PackedFile> = []
  collectPackedFiles(header, files)
  return 8 + headerSize + files.reduce((end, file) => Math.max(end, file.offset + file.size), 0)
}

/**
 * Hashes the content of every packed file and compares it with the SHA256 the header records for it. The header's
 * `integrity.hash` is the SHA256 of the whole file (https://github.com/electron/asar/blob/fde819a/src/integrity.ts#L16-L60),
 * stored per file when the archive is written (https://github.com/electron/asar/blob/fde819a/src/filesystem.ts#L202).
 * A file without `integrity` is skipped. Unpacked and linked entries have no content in the archive and are skipped too.
 * Reads each packed file once, in chunks, through one file handle.
 */
export async function verifyPackedContent(asarFile: string, header: Node, headerSize: number): Promise<void> {
  const files: Array<PackedFile> = []
  collectPackedFiles(header, files)
  const contentStart = 8 + headerSize
  const fd = await fs.open(asarFile, "r")
  try {
    const buffer = Buffer.allocUnsafe(COPY_CHUNK)
    for (const file of files) {
      const expected = file.node.integrity?.hash
      if (expected == null) {
        continue
      }
      const digest = createHash("sha256")
      for (let read = 0; read < file.size; ) {
        const n = Math.min(buffer.length, file.size - read)
        const { bytesRead } = await fs.read(fd, buffer, 0, n, contentStart + file.offset + read)
        if (bytesRead !== n) {
          throw new Error(`packed file "${file.name}" ends before its header says it does`)
        }
        digest.update(buffer.subarray(0, n))
        read += n
      }
      if (digest.digest("hex") !== expected) {
        throw new Error(`the content of packed file "${file.name}" does not match the SHA256 its header records`)
      }
    }
  } finally {
    await fs.close(fd)
  }
}

function serializeHeader(headerJson: string): Buffer {
  const headerPickle = chromiumPickleJs.createEmpty()
  headerPickle.writeString(headerJson)
  const headerBuf: Buffer = headerPickle.toBuffer()
  const sizePickle = chromiumPickleJs.createEmpty()
  sizePickle.writeUInt32(headerBuf.length)
  return Buffer.concat([sizePickle.toBuffer(), headerBuf])
}

/** `fs.write` may write fewer bytes than asked; loop until the whole range is on disk. */
async function writeFully(fd: number, buffer: Buffer, length: number): Promise<void> {
  let done = 0
  while (done < length) {
    const { bytesWritten } = await fs.write(fd, buffer, done, length - done)
    if (bytesWritten <= 0) {
      throw new Error(`short write while aligning asar content: ${done} of ${length} bytes written`)
    }
    done += bytesWritten
  }
}

async function copyRange(inFd: number, outFd: number, start: number, size: number, buffer: Buffer): Promise<void> {
  let copied = 0
  while (copied < size) {
    const n = Math.min(buffer.length, size - copied)
    const { bytesRead } = await fs.read(inFd, buffer, 0, n, start + copied)
    if (bytesRead !== n) {
      throw new Error(`Unexpected end of asar content: wanted ${n} bytes at ${start + copied}, got ${bytesRead}`)
    }
    await writeFully(outFd, buffer, n)
    copied += n
  }
}

/**
 * Re-lays the content region of an existing asar so that every packed file's content starts at a
 * multiple of `alignment` bytes (zero padding between files; file order, sizes and per-file
 * `integrity` are untouched — only the header's `offset` strings change). Readers locate content by
 * `offset` + `size`, so gaps between files are transparent to Electron and `@electron/asar`.
 *
 * Why: the differential updater diffs the stored `app.asar` block-wise, and the asar header stores
 * every file's absolute content offset. Without alignment a change that grows a file by even one
 * byte shifts the offset of every later file, rewriting most of the header — with alignment a file
 * can grow within its slot and no other offset moves.
 *
 * Streams the archive (peak memory ≈ header + 1 MiB, whatever the alignment: padding is written from
 * one shared zero buffer), writes `<file>.aligning`, verifies its size against the computed layout, closes
 * both handles and renames it over the original; on any failure the original is untouched and the temp
 * file removed.
 * Idempotent: an already aligned archive is rewritten byte-identically.
 */
export async function alignAsarContent(asarFile: string, alignment: number): Promise<AsarAlignmentResult> {
  validateContentAlignment(alignment)

  const { header: headerJson, size: headerSize } = await readAsarHeader(asarFile)
  const header = JSON.parse(headerJson) as Node
  const contentStart = 8 + headerSize
  const sizeBefore = (await fs.stat(asarFile)).size
  // Alignment copies each file from its header offset and drops bytes after the last file, so a drifted archive would come out the right size
  // and pass the sanity check. Refuse it before anything is rewritten.
  const expectedSizeBefore = expectedArchiveSize(header, headerSize)
  if (sizeBefore !== expectedSizeBefore) {
    throw new Error(`"${asarFile}" is corrupted: the header describes an archive of ${expectedSizeBefore} bytes, but it is ${sizeBefore} bytes; refusing to align it`)
  }

  const files: Array<PackedFile> = []
  collectPackedFiles(header, files)
  files.sort((a, b) => a.offset - b.offset)

  let cursor = 0
  let paddingBytes = 0
  const layout = files.map(file => {
    const aligned = Math.ceil(cursor / alignment) * alignment
    paddingBytes += aligned - cursor
    file.node.offset = String(aligned)
    cursor = aligned + file.size
    return { ...file, newOffset: aligned }
  })

  const newHeader = serializeHeader(JSON.stringify(header))
  const expectedSize = newHeader.length + cursor

  const tempFile = `${asarFile}.aligning`
  let inFd: number | null = await fs.open(asarFile, "r")
  let outFd: number | null = null
  try {
    outFd = await fs.open(tempFile, "w")
    await writeFully(outFd, newHeader, newHeader.length)
    const buffer = Buffer.allocUnsafe(COPY_CHUNK)
    const zeros = Buffer.alloc(Math.min(alignment, COPY_CHUNK))
    let written = 0
    for (const file of layout) {
      for (let gap = file.newOffset - written; gap > 0;) {
        const n = Math.min(gap, zeros.length)
        await writeFully(outFd, zeros, n)
        gap -= n
        written += n
      }
      await copyRange(inFd, outFd, contentStart + file.offset, file.size, buffer)
      written += file.size
    }

    const { size: actualSize } = await fs.fstat(outFd)
    if (written !== cursor || actualSize !== expectedSize) {
      throw new Error(`aligned asar is ${actualSize} bytes (${written} content bytes written), expected ${expectedSize} (${cursor} content bytes)`)
    }
    await fs.close(outFd)
    outFd = null
    // Windows refuses to replace a file that still has an open handle (EPERM): close the source before the rename
    await fs.close(inFd)
    inFd = null
    await fs.rename(tempFile, asarFile)
  } catch (e) {
    if (outFd != null) {
      await fs.close(outFd).catch(() => undefined)
      outFd = null
    }
    await fs.remove(tempFile).catch(() => undefined)
    throw e
  } finally {
    if (inFd != null) {
      await fs.close(inFd)
    }
    if (outFd != null) {
      await fs.close(outFd)
    }
  }

  const sizeAfter = (await fs.stat(asarFile)).size
  log.info({ file: log.filePath(asarFile), alignment, files: files.length, padding: paddingBytes, size: `${sizeBefore} → ${sizeAfter}` }, "aligned asar content")
  return { files: files.length, paddingBytes, sizeBefore, sizeAfter }
}
