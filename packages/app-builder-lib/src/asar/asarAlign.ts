import { log } from "builder-util"
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

async function copyRange(inFd: number, outFd: number, start: number, size: number, buffer: Buffer): Promise<void> {
  let copied = 0
  while (copied < size) {
    const n = Math.min(buffer.length, size - copied)
    const { bytesRead } = await fs.read(inFd, buffer, 0, n, start + copied)
    if (bytesRead !== n) {
      throw new Error(`Unexpected end of asar content: wanted ${n} bytes at ${start + copied}, got ${bytesRead}`)
    }
    await fs.write(outFd, buffer, 0, n)
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
 * Streams the archive (peak memory ≈ header + 1 MiB), writes `<file>.aligning` and renames it over
 * the original. Idempotent: an already aligned archive is rewritten byte-identically.
 */
export async function alignAsarContent(asarFile: string, alignment: number): Promise<AsarAlignmentResult> {
  if (!Number.isInteger(alignment) || alignment < 1) {
    throw new Error(`asar contentAlignment must be a positive integer, got ${String(alignment)}`)
  }

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

  const tempFile = `${asarFile}.aligning`
  const inFd = await fs.open(asarFile, "r")
  const outFd = await fs.open(tempFile, "w")
  try {
    await fs.write(outFd, serializeHeader(JSON.stringify(header)))
    const buffer = Buffer.allocUnsafe(COPY_CHUNK)
    let written = 0
    for (const file of layout) {
      if (file.newOffset > written) {
        const gap = file.newOffset - written
        await fs.write(outFd, Buffer.alloc(gap))
        written += gap
      }
      await copyRange(inFd, outFd, contentStart + file.offset, file.size, buffer)
      written += file.size
    }
  } finally {
    await Promise.all([fs.close(inFd), fs.close(outFd)])
  }
  await fs.rename(tempFile, asarFile)

  const sizeAfter = (await fs.stat(asarFile)).size
  log.info({ file: log.filePath(asarFile), alignment, files: files.length, padding: paddingBytes, size: `${sizeBefore} → ${sizeAfter}` }, "aligned asar content")
  return { files: files.length, paddingBytes, sizeBefore, sizeAfter }
}
