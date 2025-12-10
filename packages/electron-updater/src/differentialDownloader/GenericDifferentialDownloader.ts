<<<<<<< HEAD
import { BlockMap } from "builder-util-runtime"
import { DifferentialDownloader } from "./DifferentialDownloader.js"
=======
import { BlockMap } from "builder-util-runtime/out/blockMapApi"
<<<<<<< HEAD
import { DifferentialDownloader } from "./DifferentialDownloader.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { DifferentialDownloader } from "./DifferentialDownloader.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

export class GenericDifferentialDownloader extends DifferentialDownloader {
  download(oldBlockMap: BlockMap, newBlockMap: BlockMap): Promise<any> {
    return this.doDownload(oldBlockMap, newBlockMap)
  }
}
