import exitHook from "async-exit-hook"
import BluebirdPromise from "bluebird-lst"
import { mkdirs, mkdtemp, remove, removeSync, unlink, unlinkSync } from "fs-extra-p"
import { Lazy } from "lazy-val"
import { tmpdir } from "os"
import * as path from "path"
import { CONCURRENCY } from "./fs"
import { getTempName } from "./util"

let tmpFileCounter = 0
const tmpDirManagers = new Set<TmpDir>()

const tempDir = new Lazy<string>(() => {
  let promise: Promise<string>
  const systemTmpDir = process.env.TEST_DIR || tmpdir()
  if (mkdtemp == null) {
    const dir = path.join(systemTmpDir, getTempName("electron-builder"))
    promise = mkdirs(dir, {mode: 448}).then(() => dir)
  }
  else {
    promise = mkdtemp(`${path.join(systemTmpDir, "electron-builder")}-`)
  }

  return promise
    .then(dir => {
      exitHook(callback => {
        const managers = Array.from(tmpDirManagers)
        tmpDirManagers.clear()

        if (callback == null) {
          for (const manger of managers) {
            manger.cleanupSync()
          }

          try {
            removeSync(dir)
          }
          catch (e) {
            handleError(e, dir)
          }
          return
        }

        // each instead of map to avoid fs overload
        BluebirdPromise.each(managers, it => it.cleanup())
          .then(() => remove(dir))
          .then(() => callback())
          .catch(e => {
            try {
              handleError(e, dir)
            }
            finally {
              callback()
            }
          })
      })
      return dir
    })
})

function handleError(e: any, file: string) {
  if (e.code !== "EPERM" && e.code !== "ENOENT") {
    // use only console.* instead of our warn on exit (otherwise nodeEmoji can be required on request)
    console.warn(`Cannot delete temporary "${file}": ${(e.stack || e).toString()}`)
  }
}

interface TempFileInfo {
  isDir: boolean
  path: string
  disposer: ((file: string) => Promise<void>) | null
}

export class TmpDir {
  private tempFiles: Array<TempFileInfo> = []
  private registered = false

  getTempDir(suffix: string) {
    return this.getTempFile(suffix, true)
  }

  getTempFile(suffix: string, isDir: boolean = false, disposer: ((file: string) => Promise<void>) | null = null): Promise<string> {
    return tempDir.value
      .then(it => {
        if (!this.registered) {
          this.registered = true
          tmpDirManagers.add(this)
        }

        const result = `${it}${path.sep}${(tmpFileCounter++).toString(16)}${suffix.length === 0 || suffix.startsWith(".") ? suffix : `-${suffix}`}`
        this.tempFiles.push({path: result, isDir, disposer})
        return result
      })
  }

  cleanupSync() {
    const tempFiles = this.tempFiles
    tmpDirManagers.delete(this)
    this.registered = false
    if (tempFiles.length === 0) {
      return
    }

    this.tempFiles = []

    for (const file of tempFiles) {
      if (file.disposer != null) {
        // noinspection JSIgnoredPromiseFromCall
        file.disposer(file.path)
        continue
      }

      try {
        if (file.isDir) {
          removeSync(file.path)
        }
        else {
          unlinkSync(file.path)
        }
      }
      catch (e) {
        handleError(e, file.path)
      }
    }
  }

  cleanup(): Promise<any> {
    const tempFiles = this.tempFiles
    tmpDirManagers.delete(this)
    this.registered = false
    if (tempFiles.length === 0) {
      return BluebirdPromise.resolve()
    }

    this.tempFiles = []

    return BluebirdPromise.map(tempFiles, it => {
      if (it.disposer != null) {
        return it.disposer(it.path)
      }

      return (it.isDir ? remove(it.path) : unlink(it.path))
        .catch(e => {
          handleError(e, it.path)
        })
    }, CONCURRENCY)
  }
}
