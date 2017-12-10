import { BLOCK_MAP_FILE_NAME, BlockMap } from "builder-util-runtime/out/blockMapApi"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { DifferentialDownloader } from "./DifferentialDownloader"

export class GenericDifferentialDownloader extends DifferentialDownloader {
  async download(newBlockMap: BlockMap) {
    await this.doDownload(await readJson(path.join(process.resourcesPath!!, "..", BLOCK_MAP_FILE_NAME)), newBlockMap)
  }
}