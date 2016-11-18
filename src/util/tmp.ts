import { tmpdir } from "os"
import { remove, mkdirs, removeSync } from "fs-extra-p"
import * as path from "path"
import { getTempName } from "./util"
import BluebirdPromise from "bluebird-lst-c"
import { warn } from "./log"

const mkdtemp: any | null = require("fs-extra-p").mkdtemp

process.setMaxListeners(30)

export class TmpDir {
  private tmpFileCounter = 0
  private tempDirectoryPromise: BluebirdPromise<string>

  private dir: string | null

  getTempFile(suffix: string): BluebirdPromise<string> {
    if (this.tempDirectoryPromise == null) {
      let promise: BluebirdPromise<string>
      if (mkdtemp == null) {
        const dir = path.join(tmpdir(), getTempName("electron-builder"))
        promise = mkdirs(dir, {mode: 448}).thenReturn(dir)
      }
      else {
        promise = mkdtemp(`${path.join(process.env.TEST_DIR || tmpdir(), "electron-builder")}-`)
      }

      this.tempDirectoryPromise = promise
        .then(dir => {
          this.dir = dir
          const cleanup = () => {
            if (this.dir == null) {
              return
            }

            this.dir = null
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

    return this.tempDirectoryPromise
      .then(it => path.join(it, `t-${process.pid.toString(16)}-${(this.tmpFileCounter++).toString(16)}${suffix.startsWith(".") ? suffix : `-${suffix}`}`))
  }

  cleanup(): Promise<any> {
    const dir = this.dir
    if (dir == null) {
      return BluebirdPromise.resolve()
    }

    this.dir = null
    return remove(dir)
      .catch(e => {
        if (e.code === "EPERM") {
          this.dir = dir
        }
        else {
          warn(`Cannot delete temporary dir "${dir}": ${(e.stack || e).toString()}`)
        }
      })
  }
}
