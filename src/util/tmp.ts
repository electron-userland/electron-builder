import { tmpdir } from "os"
import { remove, mkdirs, removeSync, mkdtemp } from "fs-extra-p"
import * as path from "path"
import { getTempName } from "./util"
import BluebirdPromise from "bluebird-lst-c"
import { warn } from "./log"
import { all } from "./promise"

process.setMaxListeners(30)

let tempDirPromise: Promise<string> | null
let tempDir: string | null

function getTempDir() {
  if (tempDirPromise == null) {
    let promise: Promise<string>
    const systemTmpDir = process.env.TEST_DIR || tmpdir()
    if (mkdtemp == null) {
      const dir = path.join(systemTmpDir, getTempName("electron-builder"))
      promise = mkdirs(dir, {mode: 448}).then(() => dir)
    }
    else {
      promise = mkdtemp(`${path.join(systemTmpDir, "electron-builder")}-`)
    }

    tempDirPromise = promise
      .then(dir => {
        tempDir = dir
        const cleanup = () => {
          if (tempDir == null) {
            return
          }

          tempDir = null
          try {
            removeSync(dir)
          }
          catch (e) {
            if (e.code !== "EPERM") {
              warn(`Cannot delete temporary dir "${dir}": ${(e.stack || e).toString()}`)
            }
          }
        }
        process.on("exit", cleanup)
        process.on("uncaughtException", cleanup)
        process.on("SIGINT", cleanup)
        return dir
      })
  }

  return tempDirPromise
}

let tmpFileCounter = 0

export class TmpDir {
  private tempPrefixPromise: Promise<string> | null
  private tempFiles: Array<string> = []

  getTempFile(suffix: string): Promise<string> {
    if (this.tempPrefixPromise == null) {
      this.tempPrefixPromise = getTempDir().then(it => path.join(it, (tmpFileCounter++).toString(16)))
    }

    return this.tempPrefixPromise
      .then(it => {
        const result = `${it}-${(tmpFileCounter++).toString(16)}${suffix.length === 0 || suffix.startsWith(".") ? suffix : `-${suffix}`}`
        this.tempFiles.push(result)
        return result
      })
  }

  cleanup(): Promise<any> {
    const tempFiles = this.tempFiles
    if (tempFiles.length === 0) {
      return BluebirdPromise.resolve()
    }

    this.tempFiles = []
    this.tempPrefixPromise = null

    return all(tempFiles.map(it => remove(it)
      .catch(e => {
        if (e.code !== "EPERM") {
          warn(`Cannot delete temporary dir "${it}": ${(e.stack || e).toString()}`)
        }
      })
    ))
  }
}
