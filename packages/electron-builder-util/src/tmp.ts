import exitHook from "async-exit-hook"
import BluebirdPromise from "bluebird-lst"
import { mkdirs, mkdtemp, remove, removeSync } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import { CONCURRENCY } from "./fs"
import { warn } from "./log"
import { getTempName } from "./util"

let tempDirPromise: Promise<string> | null

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
        function handleError(e: any) {
          if (e.code !== "EPERM") {
            warn(`Cannot delete temporary dir "${dir}": ${(e.stack || e).toString()}`)
          }
        }

        exitHook(callback => {
          if (callback == null) {
            try {
              removeSync(dir)
            }
            catch (e) {
              handleError(e)
            }
            return
          }

          remove(dir)
            .then(() => callback())
            .catch(e => {
              try {
                handleError(e)
              }
              finally {
                callback()
              }
            })
        })
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

    return BluebirdPromise.map(tempFiles, it => {
      remove(it)
        .catch(e => {
          if (e.code !== "EPERM") {
            warn(`Cannot delete temporary dir "${it}": ${(e.stack || e).toString()}`)
          }
        })
    }, CONCURRENCY)
  }
}
