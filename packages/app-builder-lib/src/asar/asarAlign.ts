import { InvalidConfigurationError, log } from "builder-util"
import chromiumPickleJs from "chromium-pickle-js"
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
  offset: number
  size: number
}

function collectPackedFiles(node: Node, result: Array<PackedFile>): void {
  const files = node.files
  if (files == null) {
    return
  }
  for (const child of Object.values(files)) {
    if (child.files != null) {
      collectPackedFiles(child, result)
    } else if (child.offset != null && !child.unpacked && child.link == null) {
      result.push({ node: child, offset: parseInt(child.offset, 10), size: child.size ?? 0 })
    }
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
