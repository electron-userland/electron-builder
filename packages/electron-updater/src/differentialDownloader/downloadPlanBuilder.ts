import { BlockMap, BlockMapFile } from "builder-util-runtime/out/blockMapApi"
import { Logger } from "../main"

export enum OperationKind {
  COPY, DOWNLOAD
}

export interface Operation {
  kind: OperationKind

  start: number
  end: number
}

export function computeOperations(oldBlockMap: BlockMap, newBlockMap: BlockMap, logger: Logger) {
  const nameToOldBlocks = buildBlockFileMap(oldBlockMap.files)
  const nameToNewBlocks = buildBlockFileMap(newBlockMap.files)

  const oldEntryMap = buildEntryMap(oldBlockMap.files)

  let lastOperation: Operation | null = null

  const operations: Array<Operation> = []
  for (const blockMapFile of newBlockMap.files) {
    const name = blockMapFile.name
    const oldEntry = oldEntryMap.get(name)
    if (oldEntry == null) {
      // new file
      operations.push({
        kind: OperationKind.DOWNLOAD,
        start: blockMapFile.offset,
        end: blockMapFile.offset + blockMapFile.sizes.reduce((accumulator, currentValue) => accumulator + currentValue),
      })
      continue
    }

    const newFile = nameToNewBlocks.get(name)!!
    let changedBlockCount = 0

    const {checksumToOffset: checksumToOldOffset, checksumToOldSize} = buildChecksumMap(nameToOldBlocks.get(name)!!, oldEntry.offset)

    let newOffset = blockMapFile.offset
    for (let i = 0; i < newFile.checksums.length; newOffset += newFile.sizes[i], i++) {
      const blockSize = newFile.sizes[i]
      const checksum = newFile.checksums[i]
      let oldOffset: number | null | undefined = checksumToOldOffset.get(checksum)
      if (oldOffset != null && checksumToOldSize.get(checksum) !== blockSize) {
        logger.warn(`Checksum ("${checksum}") matches, but size differs (old: ${checksumToOldSize.get(checksum)}, new: ${blockSize})`)
        oldOffset = null
      }

      if (oldOffset == null) {
        changedBlockCount++

        if (lastOperation == null || lastOperation.kind !== OperationKind.DOWNLOAD || lastOperation.end !== newOffset) {
          lastOperation = {
            kind: OperationKind.DOWNLOAD,
            start: newOffset,
            end: newOffset + blockSize,
          }
          operations.push(lastOperation)
        }
        else {
          lastOperation.end += blockSize
        }
      }
      else if (lastOperation == null || lastOperation.kind !== OperationKind.COPY || lastOperation.end !== oldOffset) {
        lastOperation = {
          kind: OperationKind.COPY,
          start: oldOffset,
          end: oldOffset + blockSize,
        }
        operations.push(lastOperation)
      }
      else {
        lastOperation.end += blockSize
      }
    }

    if (changedBlockCount > 0) {
      logger.info(`File${blockMapFile.name === "file" ? "" : (" " + blockMapFile.name)} has ${changedBlockCount} changed blocks`)
    }
  }
  return operations
}

function buildChecksumMap(file: BlockMapFile, fileOffset: number) {
  const checksumToOffset = new Map<string, number>()
  const checksumToSize = new Map<string, number>()
  let offset = fileOffset
  for (let i = 0; i < file.checksums.length; i++) {
    const checksum = file.checksums[i]
    const size = file.sizes[i]
    checksumToOffset.set(checksum, offset)
    checksumToSize.set(checksum, size)
    offset += size
  }
  return {checksumToOffset, checksumToOldSize: checksumToSize}
}

function buildEntryMap(list: Array<BlockMapFile>) {
  const result = new Map<string, BlockMapFile>()
  for (const item of list) {
    result.set(item.name, item)
  }
  return result
}

function buildBlockFileMap(list: Array<BlockMapFile>) {
  const result = new Map<string, BlockMapFile>()
  for (const item of list) {
    result.set(item.name, item)
  }
  return result
}