import BluebirdPromise from "bluebird-lst"
import { Hash } from "crypto"
import { Arch, debug, warn } from "builder-util"
import { copyFile } from "builder-util/out/fs"
import { orNullIfFileNotExist } from "builder-util/out/promise"
import { ensureDir, readFile, readJson, writeJson } from "fs-extra-p"
import * as path from "path"

export interface BuildCacheInfo {
  executableDigest: string
}

export class BuildCacheManager {
  static VERSION: string = "0"

  readonly cacheDir: string
  readonly cacheInfoFile: string
  readonly cacheFile: string

  cacheInfo: BuildCacheInfo | null

  private newDigest: string | null

  constructor(outDir: string, private readonly executableFile: string, arch: Arch) {
    this.cacheDir = path.join(outDir, ".cache", Arch[arch])
    this.cacheFile = path.join(this.cacheDir, "app.exe")
    this.cacheInfoFile = path.join(this.cacheDir, "info.json")
  }

  async copyIfValid(digest: string): Promise<boolean> {
    this.newDigest = digest

    this.cacheInfo = await orNullIfFileNotExist(readJson(this.cacheInfoFile))
    const oldDigest = this.cacheInfo == null ? null : this.cacheInfo.executableDigest
    if (oldDigest !== digest) {
      debug(`No valid cached executable found, old digest: ${oldDigest}, new digest: ${digest}`)
      return false
    }

    debug(`Copy cached ${this.cacheFile} executable to ${this.executableFile}`)
    try {
      await copyFile(this.cacheFile, this.executableFile, false)
      return true
    }
    catch (e) {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") {
        debug(`Copy cached executable failed: ${e.code}`)
      }
      else {
        warn(`Cannot copy cached executable: ${e.stack || e}`)
      }
    }
    return false
  }

  async save() {
    if (this.newDigest == null) {
      throw new Error("call copyIfValid before")
    }

    if (this.cacheInfo == null) {
      this.cacheInfo = {executableDigest: this.newDigest}
    }
    else {
      this.cacheInfo.executableDigest = this.newDigest
    }

    try {
      await ensureDir(this.cacheDir)
      await BluebirdPromise.all([writeJson(this.cacheInfoFile, this.cacheInfo), copyFile(this.executableFile, this.cacheFile, false)])
    }
    catch (e) {
      warn(`Cannot save build cache: ${e.stack || e}`)
    }
  }
}

export async function digest(hash: Hash, files: Array<string>) {
  // do not use pipe - better do bulk file read (https://github.com/yarnpkg/yarn/commit/7a63e0d23c46a4564bc06645caf8a59690f04d01)
  for (const content of await BluebirdPromise.map(files, it => readFile(it))) {
    hash.update(content)
  }

  hash.update(BuildCacheManager.VERSION)
  return hash.digest("base64")
}