import { BlockMap } from "builder-util-runtime"
import * as fsExtra from "fs-extra"
import { DifferentialDownloader } from "./DifferentialDownloader.js"
import { inflateRawSync } from "zlib"

export class FileWithEmbeddedBlockMapDifferentialDownloader extends DifferentialDownloader {
  async download(): Promise<void> {
    const packageInfo = this.blockAwareFileInfo
    const fileSize = packageInfo.size!
    const offset = fileSize - (packageInfo.blockMapSize! + 4)
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, fileSize - 1)
    const newBlockMap = readBlockMap(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4))
    await this.doDownload(await readEmbeddedBlockMapData(this.options.oldFile), newBlockMap)
  }
}

function readBlockMap(data: Buffer): BlockMap {
  return JSON.parse(inflateRawSync(data).toString())
}

async function readEmbeddedBlockMapData(file: string): Promise<BlockMap> {
  const fd = await fsExtra.open(file, "r")
  try {
    const fileSize = (await fsExtra.fstat(fd)).size
    const sizeBuffer = Buffer.allocUnsafe(4)
    await fsExtra.read(fd, sizeBuffer, 0, sizeBuffer.length, fileSize - sizeBuffer.length)

    const dataBuffer = Buffer.allocUnsafe(sizeBuffer.readUInt32BE(0))
    await fsExtra.read(fd, dataBuffer, 0, dataBuffer.length, fileSize - sizeBuffer.length - dataBuffer.length)
    await fsExtra.close(fd)

    return readBlockMap(dataBuffer)
  } catch (e: any) {
    await fsExtra.close(fd)
    throw e
  }
}
