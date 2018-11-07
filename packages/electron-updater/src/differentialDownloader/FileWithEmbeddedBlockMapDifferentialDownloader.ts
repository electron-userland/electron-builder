import { BlockMap, readEmbeddedBlockMapData } from "builder-util-runtime/out/blockMapApi"
import { DifferentialDownloader } from "./DifferentialDownloader"

export class FileWithEmbeddedBlockMapDifferentialDownloader extends DifferentialDownloader {
  async download() {
    const packageInfo = this.blockAwareFileInfo
    const fileSize = packageInfo.size!!
    const offset = fileSize - (packageInfo.blockMapSize!! + 4)
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, fileSize - 1)
    const newBlockMap = await readBlockMap(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4))
    await this.doDownload(JSON.parse(await readEmbeddedBlockMapData(this.options.oldFile)), newBlockMap)
  }
}

let pako: any = null

async function readBlockMap(data: Buffer): Promise<BlockMap> {
  if (pako == null) {
    pako = require("pako")
  }
  return JSON.parse(pako.inflateRaw(data, {to: "string"}))
}