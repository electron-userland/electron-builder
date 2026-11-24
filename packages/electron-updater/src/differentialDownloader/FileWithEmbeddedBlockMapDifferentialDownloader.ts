import { BlockMap, newError } from "builder-util-runtime"
import fsExtra from "fs-extra"
import { blockMapSizeLimit, DifferentialDownloader, ERR_UPDATER_INVALID_BLOCKMAP } from "./DifferentialDownloader.js"
import { inflateRawSync } from "zlib"

export class FileWithEmbeddedBlockMapDifferentialDownloader extends DifferentialDownloader {
  async download(): Promise<void> {
    const packageInfo = this.blockAwareFileInfo
    const fileSize = packageInfo.size
    const blockMapSize = packageInfo.blockMapSize
    const limit = blockMapSizeLimit(fileSize)
    // it sets how many bytes are requested and allocated: checked before the request
    if (
      !(
        typeof fileSize === "number" &&
        typeof blockMapSize === "number" &&
        Number.isSafeInteger(blockMapSize) &&
        blockMapSize > 0 &&
        blockMapSize + 4 <= fileSize &&
        blockMapSize <= limit
      )
    ) {
      throw newError(`Invalid blockMapSize ${blockMapSize} for a ${fileSize}-byte file (at most ${limit} bytes)`, ERR_UPDATER_INVALID_BLOCKMAP)
    }
    const offset = fileSize - (blockMapSize + 4)
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, fileSize - 1)
    const newBlockMap = readBlockMap(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4), limit)
    await this.doDownload(await readEmbeddedBlockMapData(this.options.oldFile), newBlockMap)
  }
}

function readBlockMap(data: Buffer, maxOutputLength: number): BlockMap {
  let json: Buffer
  try {
    json = inflateRawSync(data, { maxOutputLength })
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && e.code === "ERR_BUFFER_TOO_LARGE") {
      throw newError(`Embedded block map inflates to more than the ${maxOutputLength}-byte limit`, ERR_UPDATER_INVALID_BLOCKMAP)
    }
    throw e
  }
  return JSON.parse(json.toString())
}

async function readEmbeddedBlockMapData(file: string): Promise<BlockMap> {
  const fd = await fsExtra.open(file, "r")
  try {
    const fileSize = (await fsExtra.fstat(fd)).size
    const sizeBuffer = Buffer.allocUnsafe(4)
    await fsExtra.read(fd, sizeBuffer, 0, sizeBuffer.length, fileSize - sizeBuffer.length)

    const blockMapSize = sizeBuffer.readUInt32BE(0)
    const limit = blockMapSizeLimit(fileSize)
    if (blockMapSize === 0 || blockMapSize > fileSize - sizeBuffer.length || blockMapSize > limit) {
      throw newError(`"${file}" declares a ${blockMapSize}-byte block map: empty, or more than the file holds or the ${limit}-byte limit`, ERR_UPDATER_INVALID_BLOCKMAP)
    }
    const dataBuffer = Buffer.allocUnsafe(blockMapSize)
    await fsExtra.read(fd, dataBuffer, 0, dataBuffer.length, fileSize - sizeBuffer.length - dataBuffer.length)
    return readBlockMap(dataBuffer, limit)
  } finally {
    await fsExtra.close(fd)
  }
}
