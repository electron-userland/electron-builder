import { emptyDir, remove } from "fs-extra-p"
import * as path from "path"
import { Target } from "../core"
import { Arch, debug } from "builder-util"
import { PlatformPackager } from "../platformPackager"

export class StageDir {
  constructor(readonly dir: string) {
  }

  getTempFile(name: string) {
    return this.dir + path.sep + name
  }

  cleanup() {
    if (!debug.enabled || process.env.ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG === "true") {
      return remove(this.dir)
    }
    return Promise.resolve()
  }

  toString() {
    return this.dir
  }
}

export async function createStageDir(target: Target, packager: PlatformPackager<any>, arch: Arch): Promise<StageDir> {
  return new StageDir(await createStageDirPath(target, packager, arch))
}

export async function createStageDirPath(target: Target, packager: PlatformPackager<any>, arch: Arch): Promise<string> {
  const tempDir = packager.info.stageDirPathCustomizer(target, packager, arch)
  await emptyDir(tempDir)
  return tempDir
}