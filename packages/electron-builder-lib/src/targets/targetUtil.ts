import { emptyDir, remove } from "fs-extra-p"
import * as path from "path"
import { Target } from "../core"
import { Arch, debug } from "builder-util"
import BluebirdPromise from "bluebird-lst"
import { PlatformPackager } from "../platformPackager"

export class StageDir {
  constructor(readonly dir: string) {
  }

  ensureEmpty() {
    return emptyDir(this.dir)
  }

  getTempFile(name: string) {
    return this.dir + path.sep + name
  }

  cleanup() {
    if (!debug.enabled || process.env.ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG === "true") {
      return remove(this.dir)
    }
    return BluebirdPromise.resolve()
  }

  toString() {
    return this.dir
  }
}

export async function createStageDir(target: Target, packager: PlatformPackager<any>, arch: Arch): Promise<StageDir> {
  const tempDir = packager.info.stageDirPathCustomizer(target, packager, arch)
  const stageDir = new StageDir(tempDir)
  await stageDir.ensureEmpty()
  return stageDir
}