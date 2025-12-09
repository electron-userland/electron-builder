import { BlockMap } from "builder-util-runtime/out/blockMapApi"
import { DifferentialDownloader } from "./DifferentialDownloader.js.js"

export class GenericDifferentialDownloader extends DifferentialDownloader {
  download(oldBlockMap: BlockMap, newBlockMap: BlockMap): Promise<any> {
    return this.doDownload(oldBlockMap, newBlockMap)
  }
}
