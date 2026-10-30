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

/** `value` rounded up to a multiple of `alignment`. */
export function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment
}

/**
 * One stretch of packed content in an asar: the bytes at `offset` / `size` and every header entry that points at them.
 * `@electron/asar` stores files with identical content once and points all their entries at that copy, so a re-layout
 * moves such entries together and keeps the de-duplication.
 */
export interface AsarContentUnit {
  /** `/`-separated paths inside the archive of the entries that share this content, in header order */
  readonly paths: Array<string>
  /** offset in the content region of the archive being re-laid */
  readonly offset: number
  readonly size: number
}

/** Receives the units in content order and returns their new offsets (same order); the new ranges must not overlap. */
export type AsarLayoutPlanner = (units: Array<AsarContentUnit>) => Array<number>

interface PackedFile {
  path: string
  node: Node
  offset: number
  size: number
}

function collectPackedFiles(node: Node, prefix: string, result: Array<PackedFile>): void {
  const files = node.files
  if (files == null) {
    return
  }
  for (const [name, child] of Object.entries(files)) {
    const rel = prefix.length === 0 ? name : `${prefix}/${name}`
    if (child.files != null) {
      collectPackedFiles(child, rel, result)
    } else if (child.offset != null && !child.unpacked && child.link == null) {
      result.push({ path: rel, node: child, offset: parseInt(child.offset, 10), size: child.size ?? 0 })
    }
  }
}

interface UnitEntry {
  unit: { paths: Array<string>; offset: number; size: number }
  nodes: Array<Node>
}

function groupIntoUnits(files: Array<PackedFile>): Array<UnitEntry> {
  const byRange = new Map<string, UnitEntry>()
  for (const file of files) {
    const key = `${file.offset}:${file.size}`
    let entry = byRange.get(key)
    if (entry == null) {
      entry = { unit: { paths: [], offset: file.offset, size: file.size }, nodes: [] }
      byRange.set(key, entry)
    }
    entry.unit.paths.push(file.path)
    entry.nodes.push(file.node)
  }
  // an empty file sorts before a file that starts at the same offset, so the content order is never ambiguous
  return [...byRange.values()].sort((a, b) => a.unit.offset - b.unit.offset || a.unit.size - b.unit.size)
}

/**
 * Reads the packed content units of an asar (see `AsarContentUnit`) in content order, without rewriting anything.
 * @internal
 */
export async function readAsarContentUnits(asarFile: string): Promise<Array<AsarContentUnit>> {
  const files: Array<PackedFile> = []
  collectPackedFiles(JSON.parse((await readAsarHeader(asarFile)).header) as Node, "", files)
  return groupIntoUnits(files).map(it => it.unit)
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
 * Re-lays the content region of an existing asar at the offsets `plan` chooses (zero filling between files). File
 * sizes, the header's entry order and per-file `integrity` are untouched — only the header's `offset` strings change.
 * Readers locate content by `offset` + `size`, so gaps between files are transparent to Electron and `@electron/asar`.
 *
 * Streams the archive (peak memory ≈ header + 1 MiB, whatever the gaps: they are written from one shared zero
 * buffer), writes `<file>.aligning`, verifies its size against the computed layout, closes both handles and renames
 * it over the original; on any failure the original is untouched and the temp file removed.
 * @internal
 */
export async function relayoutAsarContent(asarFile: string, plan: AsarLayoutPlanner): Promise<AsarAlignmentResult> {
  const { header: headerJson, size: headerSize } = await readAsarHeader(asarFile)
  const header = JSON.parse(headerJson) as Node
  const contentStart = 8 + headerSize
  const sizeBefore = (await fs.stat(asarFile)).size

  const files: Array<PackedFile> = []
  collectPackedFiles(header, "", files)
  const units = groupIntoUnits(files)
  const newOffsets = plan(units.map(it => it.unit))
  if (newOffsets.length !== units.length) {
    throw new Error(`asar layout plan returned ${newOffsets.length} offsets for ${units.length} content units`)
  }

  const layout = units.map((entry, index) => ({ ...entry, newOffset: newOffsets[index] })).sort((a, b) => a.newOffset - b.newOffset || a.unit.size - b.unit.size)
  let cursor = 0
  let fileBytes = 0
  for (const entry of layout) {
    if (!Number.isSafeInteger(entry.newOffset) || entry.newOffset < cursor) {
      throw new Error(`asar layout plan places ${entry.unit.paths[0]} at ${entry.newOffset}, overlapping the file before it (which ends at ${cursor})`)
    }
    for (const node of entry.nodes) {
      node.offset = String(entry.newOffset)
    }
    cursor = entry.newOffset + entry.unit.size
    fileBytes += entry.unit.size
  }

  const newHeader = serializeHeader(JSON.stringify(header))
  const expectedSize = newHeader.length + cursor

  const tempFile = `${asarFile}.aligning`
  let inFd: number | null = await fs.open(asarFile, "r")
  let outFd: number | null = null
  try {
    outFd = await fs.open(tempFile, "w")
    await writeFully(outFd, newHeader, newHeader.length)
    const buffer = Buffer.allocUnsafe(COPY_CHUNK)
    const zeros = Buffer.alloc(COPY_CHUNK)
    let written = 0
    for (const { unit, newOffset } of layout) {
      for (let gap = newOffset - written; gap > 0;) {
        const n = Math.min(gap, zeros.length)
        await writeFully(outFd, zeros, n)
        gap -= n
        written += n
      }
      await copyRange(inFd, outFd, contentStart + unit.offset, unit.size, buffer)
      written += unit.size
    }

    const { size: actualSize } = await fs.fstat(outFd)
    if (written !== cursor || actualSize !== expectedSize) {
      throw new Error(`re-laid asar is ${actualSize} bytes (${written} content bytes written), expected ${expectedSize} (${cursor} content bytes)`)
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

  return { files: files.length, paddingBytes: cursor - fileBytes, sizeBefore, sizeAfter: (await fs.stat(asarFile)).size }
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
 * See `relayoutAsarContent` for how the archive is rewritten; entries that share content (`@electron/asar`
 * de-duplicates identical files) keep sharing it.
 * Idempotent: an already aligned archive is rewritten byte-identically.
 */
export async function alignAsarContent(asarFile: string, alignment: number): Promise<AsarAlignmentResult> {
  validateContentAlignment(alignment)
  const result = await relayoutAsarContent(asarFile, units => {
    let cursor = 0
    return units.map(unit => {
      const offset = alignUp(cursor, alignment)
      cursor = offset + unit.size
      return offset
    })
  })
  log.info(
    { file: log.filePath(asarFile), alignment, files: result.files, padding: result.paddingBytes, size: `${result.sizeBefore} → ${result.sizeAfter}` },
    "aligned asar content"
  )
  return result
}
