import { BlockMap } from "builder-util-runtime"
import { DifferentialDownloader } from "./DifferentialDownloader.js"

export class GenericDifferentialDownloader extends DifferentialDownloader {
  download(oldBlockMap: BlockMap, newBlockMap: BlockMap): Promise<any> {
    return this.doDownload(oldBlockMap, newBlockMap)
  }
}
