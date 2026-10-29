import { BlockMap, newError } from "builder-util-runtime"
import { blockMapSizeLimit } from "builder-util-runtime/internal"
import fsExtra from "fs-extra"
import { DifferentialDownloader } from "./DifferentialDownloader.js"
import { inflateRawSync } from "zlib"

export class FileWithEmbeddedBlockMapDifferentialDownloader extends DifferentialDownloader {
  async download(): Promise<void> {
    const packageInfo = this.blockAwareFileInfo
    const fileSize = packageInfo.size!
    const blockMapSize = packageInfo.blockMapSize!
    // the block map and its 4-byte size trail the file: without a non-empty one inside the file there is nothing to plan on
    if (!Number.isSafeInteger(fileSize) || !Number.isSafeInteger(blockMapSize) || blockMapSize <= 0 || blockMapSize + 4 > fileSize) {
      throw newError(`Invalid embedded block map size ${blockMapSize} for a ${fileSize}-byte file`, "ERR_UPDATER_INVALID_BLOCKMAP")
    }
    const offset = fileSize - (blockMapSize + 4)
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, fileSize - 1)
    const newBlockMap = readBlockMap(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4), blockMapSizeLimit(fileSize))
    await this.doDownload(await readEmbeddedBlockMapData(this.options.oldFile), newBlockMap)
  }
}

/** `maxSize` bounds the inflated JSON, so a deflate bomb fails instead of exhausting the memory of the app. */
function readBlockMap(data: Buffer, maxSize: number): BlockMap {
  return JSON.parse(inflateRawSync(data, { maxOutputLength: maxSize }).toString())
}

async function readEmbeddedBlockMapData(file: string): Promise<BlockMap> {
  const fd = await fsExtra.open(file, "r")
  try {
    const fileSize = (await fsExtra.fstat(fd)).size
    const sizeBuffer = Buffer.allocUnsafe(4)
    await fsExtra.read(fd, sizeBuffer, 0, sizeBuffer.length, fileSize - sizeBuffer.length)

    // the size comes from the file's last 4 bytes: checked before it is allocated
    const blockMapSize = sizeBuffer.readUInt32BE(0)
    const maxSize = blockMapSizeLimit(fileSize)
    if (blockMapSize === 0 || blockMapSize + sizeBuffer.length > fileSize || blockMapSize > maxSize) {
      throw newError(`Invalid embedded block map size ${blockMapSize} in the ${fileSize}-byte "${file}"`, "ERR_UPDATER_INVALID_BLOCKMAP")
    }
    const dataBuffer = Buffer.allocUnsafe(blockMapSize)
    await fsExtra.read(fd, dataBuffer, 0, dataBuffer.length, fileSize - sizeBuffer.length - dataBuffer.length)
    return readBlockMap(dataBuffer, maxSize)
  } finally {
    await fsExtra.close(fd)
  }
}
