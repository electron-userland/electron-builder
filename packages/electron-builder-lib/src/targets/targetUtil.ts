import { emptyDir, remove } from "fs-extra-p"
import * as path from "path"
import { Target } from "../core"
import { Arch, debug } from "builder-util"
import BluebirdPromise from "bluebird-lst"

export class StageDir {
  constructor(readonly tempDir: string) {
  }

  ensureEmpty() {
    return emptyDir(this.tempDir)
  }

  getTempFile(name: string) {
    return this.tempDir + path.sep + name
  }

  cleanup() {
    if (!debug.enabled || process.env.ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG === "true") {
      return remove(this.tempDir)
    }
    return BluebirdPromise.resolve()
  }
}

export async function createHelperDir(target: Target, arch: Arch): Promise<StageDir> {
  const tempDir = path.join(target.outDir, `__${target.name}-temp-${Arch[arch]}`)
  await emptyDir(tempDir)
  return new StageDir(tempDir)
}