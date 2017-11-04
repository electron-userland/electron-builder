import { BlockMapDataHolder, HttpExecutor, PackageFileInfo } from "builder-util-runtime"
import { SIGNATURE_HEADER_SIZE } from "builder-util-runtime/out/blockMapApi"
import { readJson } from "fs-extra-p"
import { DifferentialDownloader, DifferentialDownloaderOptions, readBlockMap } from "./DifferentialDownloader"

export class SevenZipDifferentialDownloader extends DifferentialDownloader {
  constructor(packageInfo: BlockMapDataHolder, httpExecutor: HttpExecutor<any>, options: DifferentialDownloaderOptions) {
    super(packageInfo, httpExecutor, options)
  }

  async download(oldBlockMapFile: string) {
    const packageInfo = this.blockAwareFileInfo as PackageFileInfo
    const offset = packageInfo.size - packageInfo.headerSize!! - packageInfo.blockMapSize!!
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, packageInfo.size - 1)
    const newBlockMap = await readBlockMap(this.fileMetadataBuffer.slice(packageInfo.headerSize!!))
    const oldBlockMap = await readJson(oldBlockMapFile)
    await this.doDownload(oldBlockMap, newBlockMap)
  }

  protected get signatureSize() {
    return SIGNATURE_HEADER_SIZE
  }
}