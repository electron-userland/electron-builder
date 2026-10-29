import { BlockMap } from "builder-util-runtime"
import { BlockMapFile } from "builder-util-runtime/internal"
import { Logger } from "../types.js"

export enum OperationKind {
  COPY,
  DOWNLOAD,
}

export interface Operation {
  kind: OperationKind

  // inclusive
  start: number
  // exclusive
  end: number

  // debug only
  // oldBlocks: Array<string> | null
}

export function computeOperations(oldBlockMap: BlockMap, newBlockMap: BlockMap, logger: Logger): Array<Operation> {
  const nameToOldBlocks = buildBlockFileMap(oldBlockMap.files)
  const nameToNewBlocks = buildBlockFileMap(newBlockMap.files)

  let lastOperation: Operation | null = null

  // for now only one file is supported in block map
  const blockMapFile: { name: string; offset: number } = newBlockMap.files[0]
  const operations: Array<Operation> = []
  const name = blockMapFile.name
  const oldEntry = nameToOldBlocks.get(name)
  if (oldEntry == null) {
    // new file (unrealistic case for now, because in any case both blockmap contain the only file named as "file")
    throw new Error(`no file ${name} in old blockmap`)
  }

  const newFile = nameToNewBlocks.get(name)!
  let changedBlockCount = 0

  const { checksumToOffset: checksumToOldOffset, checksumToOldSize } = buildChecksumMap(nameToOldBlocks.get(name)!, oldEntry.offset, logger)

  let newOffset = blockMapFile.offset
  for (let i = 0; i < newFile.checksums.length; newOffset += newFile.sizes[i], i++) {
    const blockSize: number = newFile.sizes[i]
    const checksum = newFile.checksums[i]
    let oldOffset = checksumToOldOffset.get(checksum)
    if (oldOffset != null && checksumToOldSize.get(checksum) !== blockSize) {
      logger.warn(`Checksum ("${checksum}") matches, but size differs (old: ${checksumToOldSize.get(checksum)}, new: ${blockSize})`)
      oldOffset = undefined
    }

    if (oldOffset === undefined) {
      // download data from new file
      changedBlockCount++

      if (lastOperation != null && lastOperation.kind === OperationKind.DOWNLOAD && lastOperation.end === newOffset) {
        lastOperation.end += blockSize
      } else {
        lastOperation = {
          kind: OperationKind.DOWNLOAD,
          start: newOffset,
          end: newOffset + blockSize,
          // oldBlocks: null,
        }
        validateAndAdd(lastOperation, operations, checksum, i)
      }
    } else {
      // reuse data from old file
      if (lastOperation != null && lastOperation.kind === OperationKind.COPY && lastOperation.end === oldOffset) {
        lastOperation.end += blockSize
        // lastOperation.oldBlocks!!.push(checksum)
      } else {
        lastOperation = {
          kind: OperationKind.COPY,
          start: oldOffset,
          end: oldOffset + blockSize,
          // oldBlocks: [checksum]
        }
        validateAndAdd(lastOperation, operations, checksum, i)
      }
    }
  }

  if (changedBlockCount > 0) {
    logger.info(`File${blockMapFile.name === "file" ? "" : " " + blockMapFile.name} has ${changedBlockCount} changed blocks`)
  }
  return operations
}

/**
 * COPY gaps shorter than this many bytes between two DOWNLOAD operations are downloaded through instead
 * of being copied from the old file, so that `DOWNLOAD, COPY(gap), DOWNLOAD` becomes one DOWNLOAD range.
 *
 * Why 8 KiB: on hosts that serve one range per request (GitHub, S3 and friends — see
 * `isUseMultipleRangeRequest`) every extra DOWNLOAD range costs a full sequential HTTP round trip plus
 * ~1–1.5 KB of request/response headers, and on multipart hosts ~120 B of part framing plus a share of the
 * request; re-downloading a few KiB of data that the old file already has is cheaper than that, and a
 * plan with fewer, longer ranges also copies less from the old file (one `createReadStream` per COPY).
 * With small content-defined blocks (1–2 KiB in a stored asar region) alternating one-block gaps are common.
 */
export const DOWNLOAD_GAP_COALESCE_THRESHOLD = 8 * 1024

/**
 * The threshold on hosts that answer one request with several ranges (`multipart/byteranges`): there an
 * extra range only costs its ~120 B of part framing, so downloading through a gap pays off only below that.
 */
export const MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD = 256

/** The gap threshold for a host, from the same `isUseMultipleRangeRequest` decision the downloader takes. */
export function downloadGapCoalesceThreshold(isUseMultipleRangeRequest: boolean | undefined): number {
  return isUseMultipleRangeRequest ? MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD : DOWNLOAD_GAP_COALESCE_THRESHOLD
}

/**
 * Post-pass over a plan produced by {@link computeOperations}: merges every `DOWNLOAD, COPY…, DOWNLOAD`
 * run whose COPY operations total fewer than `maxGap` bytes into a single DOWNLOAD covering the whole
 * span of the new file. Operations are in new-file order and their lengths sum to the new file size, so
 * the merged DOWNLOAD `[first.start, last.end)` has exactly the length of the operations it replaces and
 * the total-size invariant checked by `DifferentialDownloader` is preserved. COPY-only plans and gaps of
 * `maxGap` bytes or more are returned unchanged (the same objects, not copies).
 */
export function coalesceDownloadGaps(operations: Array<Operation>, maxGap: number = DOWNLOAD_GAP_COALESCE_THRESHOLD): Array<Operation> {
  if (maxGap <= 0) {
    return operations
  }
  const result: Array<Operation> = []
  // index in `result` of the last DOWNLOAD, and the number of bytes copied since it (-1 = none / too far)
  let lastDownloadIndex = -1
  let gapSinceLastDownload = 0
  for (const operation of operations) {
    const length = operation.end - operation.start
    if (operation.kind === OperationKind.COPY) {
      if (lastDownloadIndex >= 0) {
        gapSinceLastDownload += length
      }
      result.push(operation)
      continue
    }

    const lastDownload = lastDownloadIndex >= 0 ? result[lastDownloadIndex] : null
    // the gap must be small AND the operations must really be contiguous in the new file (defensive: a
    // plan that is not in new-file order would otherwise be silently corrupted)
    if (lastDownload != null && gapSinceLastDownload < maxGap && lastDownload.end + gapSinceLastDownload === operation.start) {
      result.length = lastDownloadIndex + 1
      result[lastDownloadIndex] = { kind: OperationKind.DOWNLOAD, start: lastDownload.start, end: operation.end }
    } else {
      result.push(operation)
      lastDownloadIndex = result.length - 1
    }
    gapSinceLastDownload = 0
  }
  return result
}

const isValidateOperationRange = process.env["DIFFERENTIAL_DOWNLOAD_PLAN_BUILDER_VALIDATE_RANGES"] === "true"

function validateAndAdd(operation: Operation, operations: Array<Operation>, checksum: string, index: number): void {
  if (isValidateOperationRange && operations.length !== 0) {
    const lastOperation = operations[operations.length - 1]
    if (lastOperation.kind === operation.kind && operation.start < lastOperation.end && operation.start > lastOperation.start) {
      const min = [lastOperation.start, lastOperation.end, operation.start, operation.end].reduce((p, v) => (p < v ? p : v))
      throw new Error(
        `operation (block index: ${index}, checksum: ${checksum}, kind: ${OperationKind[operation.kind]}) overlaps previous operation (checksum: ${checksum}):\n` +
          `abs: ${lastOperation.start} until ${lastOperation.end} and ${operation.start} until ${operation.end}\n` +
          `rel: ${lastOperation.start - min} until ${lastOperation.end - min} and ${operation.start - min} until ${operation.end - min}`
      )
    }
  }
  operations.push(operation)
}

function buildChecksumMap(file: BlockMapFile, fileOffset: number, logger: Logger) {
  const checksumToOffset = new Map<string, number>()
  const checksumToSize = new Map<string, number>()
  let offset = fileOffset
  for (let i = 0; i < file.checksums.length; i++) {
    const checksum = file.checksums[i]
    const size = file.sizes[i]

    const existing = checksumToSize.get(checksum)
    if (existing === undefined) {
      checksumToOffset.set(checksum, offset)
      checksumToSize.set(checksum, size)
    } else if (logger.debug != null) {
      const sizeExplanation = existing === size ? "(same size)" : `(size: ${existing}, this size: ${size})`
      logger.debug(`${checksum} duplicated in blockmap ${sizeExplanation}, it doesn't lead to broken differential downloader, just corresponding block will be skipped)`)
    }
    offset += size
  }
  return { checksumToOffset, checksumToOldSize: checksumToSize }
}

function buildBlockFileMap(list: Array<BlockMapFile>): Map<string, BlockMapFile> {
  const result = new Map<string, BlockMapFile>()
  for (const item of list) {
    result.set(item.name, item)
  }
  return result
}
