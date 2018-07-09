import { BlockMap } from "builder-util-runtime/out/blockMapApi"
import { DifferentialDownloader } from "./DifferentialDownloader"

export class GenericDifferentialDownloader extends DifferentialDownloader {
  async download(oldBlockMap: BlockMap, newBlockMap: BlockMap) {
    await this.doDownload(oldBlockMap, newBlockMap)
  }
}