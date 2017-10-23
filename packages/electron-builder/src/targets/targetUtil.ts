import { emptyDir, remove } from "fs-extra-p"
import * as path from "path"
import { Target } from "../core"
import { Arch, debug } from "builder-util"

export class StageDir {
  constructor(readonly tempDir: string) {
  }

  getTempFile(name: string) {
    return path.join(this.tempDir, name)
  }

  async cleanup() {
    if (!debug.enabled) {
      await remove(this.tempDir)
    }
  }
}

export async function createHelperDir(target: Target, arch: Arch): Promise<StageDir> {
  const tempDir = path.join(target.outDir, `__${target.name}-temp-${Arch[arch]}`)
  await emptyDir(tempDir)
  return new StageDir(tempDir)
}