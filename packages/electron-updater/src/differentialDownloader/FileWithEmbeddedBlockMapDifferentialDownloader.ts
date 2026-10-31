import { BlockMap } from "builder-util-runtime"
import fsExtra from "fs-extra"
import { blockMapSizeLimit, DifferentialDownloader } from "./DifferentialDownloader.js"
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
      throw new Error(`Invalid blockMapSize ${blockMapSize} for a ${fileSize}-byte file (at most ${limit} bytes)`)
    }
    const offset = fileSize - (blockMapSize + 4)
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, fileSize - 1)
    const newBlockMap = readBlockMap(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4), limit)
    await this.doDownload(await readEmbeddedBlockMapData(this.options.oldFile), newBlockMap)
  }
}

function readBlockMap(data: Buffer, maxOutputLength: number): BlockMap {
  return JSON.parse(inflateRawSync(data, { maxOutputLength }).toString())
}

async function readEmbeddedBlockMapData(file: string): Promise<BlockMap> {
  const fd = await fsExtra.open(file, "r")
  try {
    const fileSize = (await fsExtra.fstat(fd)).size
    const sizeBuffer = Buffer.allocUnsafe(4)
    await fsExtra.read(fd, sizeBuffer, 0, sizeBuffer.length, fileSize - sizeBuffer.length)

    const blockMapSize = sizeBuffer.readUInt32BE(0)
    const limit = blockMapSizeLimit(fileSize)
    if (blockMapSize > fileSize - sizeBuffer.length || blockMapSize > limit) {
      throw new Error(`"${file}" declares a ${blockMapSize}-byte block map, more than the file holds or the ${limit}-byte limit`)
    }
    const dataBuffer = Buffer.allocUnsafe(blockMapSize)
    await fsExtra.read(fd, dataBuffer, 0, dataBuffer.length, fileSize - sizeBuffer.length - dataBuffer.length)
    return readBlockMap(dataBuffer, limit)
  } finally {
    await fsExtra.close(fd)
  }
}
