import { BlockMap } from "builder-util-runtime/out/cjs/blockMapApi"
import { DifferentialDownloader } from "./DifferentialDownloader"

export class GenericDifferentialDownloader extends DifferentialDownloader {
  download(oldBlockMap: BlockMap, newBlockMap: BlockMap): Promise<any> {
    return this.doDownload(oldBlockMap, newBlockMap)
  }
}
